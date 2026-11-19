import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import type { FastifyInstance } from 'fastify'
import WebSocket, { WebSocketServer } from 'ws'
import { readBrowserToken } from '../http/browser-token.js'
import { isSameOrigin } from '../http/same-origin.js'
import { getRadioOptions, radioOptionsEvents, updateRadioOption, type RadioOptions } from '../services/radio/options.js'
import {
	cancelScheduledMainPlayback,
	createLocalPlayback,
	getMainPlayback,
	getNextSong,
	playbackEvents,
	scheduleMainPlayback,
	syncMainPlayback,
	type PlaybackSnapshot
} from '../services/radio/playback.js'
import { getRoamingSongs, roamingSongsEvents, type RadioSong } from '../services/radio/roaming-sync.js'
import { getNeteaseSyncState, neteaseSyncEvents, type NeteaseSyncState } from '../services/radio/sync-state.js'
import { hasBrowserSession } from '../services/session/browser-session.js'
import { getSessionStatus, startNeteaseSync } from '../services/session/netease-session.js'
import { ApiError } from '../utils/api-error.js'
import { isRecord } from '../utils/object.js'

type PlaybackRequest = { mode: 'main' } | { mode: 'local'; songId: string; playbackId?: string; positionMs?: number; paused?: boolean }

// 选歌只传歌曲 ID，断线恢复直接携带已确认的播放实例和进度
function readPlaybackRequest(message: Record<string, unknown>): PlaybackRequest {
	if (message.mode === 'main') return { mode: 'main' }
	if (message.mode !== 'local' || typeof message.songId !== 'string' || !message.songId) throw new ApiError(400, '播放指令格式异常')
	if (message.playbackId === undefined) return { mode: 'local', songId: message.songId }
	if (
		typeof message.playbackId !== 'string' ||
		!message.playbackId ||
		typeof message.positionMs !== 'number' ||
		!Number.isFinite(message.positionMs) ||
		message.positionMs < 0
	) {
		throw new ApiError(400, '播放状态无效')
	}
	return { mode: 'local', songId: message.songId, playbackId: message.playbackId, positionMs: message.positionMs, paused: message.paused === true }
}

// 配置、歌曲和主线公开下发；主线控制和网易云同步要求管理员登录
export default function initRadioLive(fastify: FastifyInstance) {
	const server = new WebSocketServer({ server: fastify.server, path: '/neon-radio/live', maxPayload: 4096 })
	const alive = new WeakSet<WebSocket>()
	const authenticated = new WeakSet<WebSocket>()
	const syncChecking = new WeakSet<WebSocket>()
	const requests = new WeakMap<WebSocket, IncomingMessage>()
	const localConnections = new WeakMap<WebSocket, PlaybackSnapshot>() // 本地连接的确认实例，用于分流广播和拒绝旧歌曲的拖动
	let pendingNotifications = Promise.resolve()
	let closing = false

	// 只向仍在线的连接发送消息
	const send = (socket: WebSocket, message: object) => {
		if (socket.readyState !== WebSocket.OPEN) return
		try {
			socket.send(JSON.stringify(message))
		} catch {
			socket.terminate()
		}
	}
	// 校验固定电台账号的浏览器会话；true 为已登录管理员，false 为未登录
	const authorize = async (socket: WebSocket, request: IncomingMessage) => {
		const valid = getSessionStatus().loggedIn && (await hasBrowserSession(readBrowserToken(request))) && getSessionStatus().loggedIn
		send(socket, { type: 'radio-auth', data: valid })
		if (valid) {
			authenticated.add(socket)
			return true
		}
		if (authenticated.has(socket)) {
			authenticated.delete(socket)
			send(socket, { type: 'auth-required', message: '登录已失效，请重新扫码登录' })
		}
		return false
	}

	// 向符合接收条件的在线连接广播同一份快照
	const broadcast = (message: object, include: (socket: WebSocket) => boolean = () => true) => {
		if (closing) return
		const payload = JSON.stringify(message)
		for (const socket of server.clients) {
			if (socket.readyState !== WebSocket.OPEN || !include(socket)) continue
			try {
				socket.send(payload)
			} catch {
				socket.terminate()
			}
		}
	}
	// 歌曲列表继续发送给主线和本地连接
	const broadcastSongs = (songs: RadioSong[]) => broadcast({ type: 'radio-songs', data: songs })
	// 本地连接不接收主线播放同步
	const broadcastPlayback = (snapshot: PlaybackSnapshot) =>
		broadcast({ type: 'playback-state', data: snapshot }, socket => !localConnections.has(socket))
	// 下发已保存的配置；关闭同步时取消待执行操作并校准主线
	const broadcastOptions = (options: RadioOptions) => {
		broadcast({ type: 'radio-options', data: options })
		if (!options.forceMainPlaybackSyncEnabled) {
			cancelScheduledMainPlayback()
			broadcastPlayback(getMainPlayback())
		}
	}

	// 先捕获快照和接收者，再串行下发，异步鉴权不会把旧状态排到新状态后面
	const sendSync = (state: NeteaseSyncState | null, snapshot = false, target?: WebSocket) => {
		const sockets = target ? [target] : [...server.clients]
		pendingNotifications = pendingNotifications
			.then(async () => {
				if (closing) return
				const results = await Promise.allSettled(
					sockets.map(async socket => {
						const request = requests.get(socket)
						if (!request || socket.readyState !== WebSocket.OPEN) return
						if (await authorize(socket, request)) send(socket, { type: 'netease-sync', data: state, snapshot })
						else if (snapshot) send(socket, { type: 'netease-sync', data: null, snapshot: true })
					})
				)
				if (results.some(result => result.status === 'rejected')) fastify.log.warn('网易云同步结果鉴权失败')
			})
			.catch(() => fastify.log.warn('网易云同步结果下发失败'))
	}

	// 管理员主线操作立即确认受理，最终播放状态由防抖后的广播确认
	const handlePlaybackRequest = async (socket: WebSocket, request: IncomingMessage, requestId: string, message: Record<string, unknown>) => {
		if (closing) return
		try {
			// 先校验指令和管理员身份，鉴权后再读取最新配置
			const command = readPlaybackRequest(message)
			const authorized = command.mode === 'local' || getRadioOptions().forceMainPlaybackSyncEnabled ? await authorize(socket, request) : false
			if (closing) return
			const options = getRadioOptions()

			// 点歌必须仍在有效列表内；游客只受游客漫游开关约束
			let song: RadioSong | null = null
			if (command.mode === 'local') {
				if (!authorized && !options.guestRoamingEnabled) throw new ApiError(401, '请先扫码登录电台')
				song = getRoamingSongs().find(item => item.id === command.songId) ?? null
				if (!song) throw new ApiError(404, '歌曲已不在漫游列表中')
				if (!Number.isFinite(song.duration) || song.duration <= 0) throw new ApiError(422, '歌曲时长无效，暂时无法播放')
			}

			if (authorized && options.forceMainPlaybackSyncEnabled && (command.mode === 'main' || !command.playbackId)) {
				// 选歌和回主线共用服务端防抖，断线不取消已受理操作
				localConnections.delete(socket)
				scheduleMainPlayback(song)
				send(socket, { type: 'playback-response', requestId, code: 202, mode: 'main' })
				return
			}

			// 普通点歌及断线恢复仅修改当前连接，回主线读取此刻快照
			let snapshot: PlaybackSnapshot
			if (song && command.mode === 'local') {
				snapshot = await createLocalPlayback(song, command)
				if (closing || socket.readyState !== WebSocket.OPEN) return
				if (!authorized && !getRadioOptions().guestRoamingEnabled) throw new ApiError(401, '游客自漫游未开启')
				localConnections.set(socket, snapshot)
			} else {
				localConnections.delete(socket)
				snapshot = getMainPlayback()
			}
			send(socket, { type: 'playback-response', requestId, code: 200, data: snapshot })
		} catch (error: unknown) {
			send(socket, {
				type: 'playback-response',
				requestId,
				code: error instanceof ApiError ? error.statusCode : 503,
				message: error instanceof Error ? error.message : '播放请求处理失败，请稍后重试'
			})
		}
	}

	// 手动暂停只冻结当前主线为本地状态，不影响其他听众，也不允许借暂停任意选歌
	const handlePauseRequest = (socket: WebSocket, requestId: string) => {
		if (closing) return
		const current = localConnections.get(socket) ?? getMainPlayback()
		if (!current.song) {
			send(socket, { type: 'playback-response', requestId, code: 404, message: '当前没有可暂停的歌曲' })
			return
		}
		const snapshot: PlaybackSnapshot = { ...current, mode: 'local', playbackId: randomUUID(), paused: true }
		localConnections.set(socket, snapshot)
		send(socket, { type: 'playback-response', requestId, code: 200, data: snapshot })
	}

	// 本地音源结束后继续下一首，自动续播不触发管理员强制改主线
	const handleNextRequest = async (socket: WebSocket, request: IncomingMessage, requestId: string, message: Record<string, unknown>) => {
		if (closing) return
		try {
			const current = localConnections.get(socket) // 只有当前本地实例可以申请续播
			if (!current?.song || current.playbackId !== message.playbackId) throw new ApiError(409, '播放实例已切换')
			const authorized = await authorize(socket, request)
			let snapshot: PlaybackSnapshot | null = null
			if (authorized || getRadioOptions().guestRoamingEnabled) {
				const next = getNextSong(current.song) // 使用服务器最新列表，不使用冻结的漫游界面列表
				if (next) snapshot = await createLocalPlayback(next)
			}
			if (closing || socket.readyState !== WebSocket.OPEN) return
			if (snapshot?.song && (authorized || getRadioOptions().guestRoamingEnabled) && getRoamingSongs().some(song => song.id === snapshot?.song?.id)) {
				localConnections.set(socket, snapshot)
				send(socket, { type: 'playback-response', requestId, code: 200, data: snapshot })
				return
			}
			// 游客漫游被关闭或列表已空时继续收听主线，不停在曲目末尾
			localConnections.delete(socket)
			send(socket, { type: 'playback-response', requestId, code: 202, mode: 'main' })
			send(socket, { type: 'playback-state', data: getMainPlayback() })
		} catch (error: unknown) {
			send(socket, {
				type: 'playback-response',
				requestId,
				code: error instanceof ApiError ? error.statusCode : 503,
				message: error instanceof Error ? error.message : '自动切歌失败'
			})
		}
	}

	// 拖动进度按管理员身份和开关决定主线同步或本地漫游
	const handleSeekRequest = async (socket: WebSocket, request: IncomingMessage, requestId: string, message: Record<string, unknown>) => {
		if (closing) return
		try {
			if (typeof message.positionMs !== 'number' || !Number.isFinite(message.positionMs) || message.positionMs < 0) {
				throw new ApiError(400, '播放进度无效')
			}
			// 鉴权后再读取最新实例，旧歌曲的拖动不能覆盖新歌曲
			const authorized = await authorize(socket, request)
			if (closing) return
			const options = getRadioOptions()
			if (!authorized && !options.guestRoamingEnabled) throw new ApiError(401, '游客自漫游未开启')
			const current = localConnections.get(socket) ?? getMainPlayback()
			if (!current.song || current.mode !== message.sourceMode || current.playbackId !== message.playbackId) {
				throw new ApiError(409, '歌曲已切换，请重新调整进度')
			}
			const positionMs = Math.min(current.song.duration, message.positionMs)
			if (authorized && options.forceMainPlaybackSyncEnabled) {
				// 主线定位立即广播，复用接管逻辑取消旧的防抖选歌
				localConnections.delete(socket)
				send(socket, { type: 'playback-response', requestId, code: 202, mode: 'main' })
				syncMainPlayback(current.song, positionMs)
				return
			}
			// 普通拖动原子切换到连接私有的本地播放，不修改主线
			const snapshot = await createLocalPlayback(current.song, { playbackId: randomUUID(), positionMs, paused: message.paused === true })
			if (closing || socket.readyState !== WebSocket.OPEN) return
			if (!authorized && !getRadioOptions().guestRoamingEnabled) throw new ApiError(401, '游客自漫游未开启')
			if ((localConnections.get(socket) ?? getMainPlayback()).playbackId !== current.playbackId) throw new ApiError(409, '歌曲已切换，请重新调整进度')
			localConnections.set(socket, snapshot)
			send(socket, { type: 'playback-response', requestId, code: 200, data: snapshot })
		} catch (error: unknown) {
			send(socket, {
				type: 'playback-response',
				requestId,
				code: error instanceof ApiError ? error.statusCode : 503,
				message: error instanceof Error ? error.message : '播放进度调整失败'
			})
		}
	}

	// 开启同步并立即推送发起管理员的歌曲和进度，不等待再次选歌
	const handleMainSyncRequest = async (socket: WebSocket, request: IncomingMessage, requestId: string, message: Record<string, unknown>) => {
		if (closing) return
		try {
			// 校验当前播放快照，记录接收时间以补偿鉴权和保存期间的进度
			const receivedAt = performance.now()
			const playback = message.playback
			const requestedPositionMs = isRecord(playback) ? playback.positionMs : 0 // 请求中的进度先独立校验，无播放快照时为 0
			if (
				message.mode !== 'main' ||
				typeof requestedPositionMs !== 'number' ||
				!Number.isFinite(requestedPositionMs) ||
				requestedPositionMs < 0 ||
				(playback !== null && (!isRecord(playback) || typeof playback.songId !== 'string' || !playback.songId || playback.songId.length > 64))
			) {
				throw new ApiError(400, '主线同步播放数据异常')
			}
			// 只有管理员可以开启同步，歌曲必须仍在有效漫游列表内
			if (!(await authorize(socket, request))) throw new ApiError(401, '请先扫码登录电台')
			if (closing) return
			const song = playback === null ? null : (getRoamingSongs().find(item => item.id === playback.songId) ?? null)
			if (playback !== null && !song) throw new ApiError(404, '当前歌曲已不在漫游列表中')
			if (song && (!Number.isFinite(song.duration) || song.duration <= 0)) throw new ApiError(422, '当前歌曲时长无效，暂时无法同步')
			const positionMs = song ? Math.min(song.duration, requestedPositionMs) : 0

			// 先保存并广播开关，保存失败时不修改主线播放
			await updateRadioOption('forceMainPlaybackSyncEnabled', true)
			if (closing) return
			// 发起页面离开本地路线，接管进度并向主线听众立即广播
			localConnections.delete(socket)
			const snapshot = syncMainPlayback(song, positionMs + performance.now() - receivedAt)
			send(socket, { type: 'playback-response', requestId, code: 200, data: snapshot })
		} catch (error: unknown) {
			send(socket, {
				type: 'playback-response',
				requestId,
				code: error instanceof ApiError ? error.statusCode : 503,
				message: error instanceof Error ? error.message : '开启主线同步失败，请稍后重试'
			})
		}
	}

	// 管理员手动启动网易云同步，任务完成另行下发状态
	const handleSyncRequest = async (socket: WebSocket, request: IncomingMessage, requestId: string) => {
		if (syncChecking.has(socket)) {
			send(socket, { type: 'netease-sync-response', requestId, code: 429, message: '正在处理同步请求，请稍后重试' })
			return
		}
		syncChecking.add(socket)
		try {
			if (!(await authorize(socket, request))) throw new ApiError(401, '请先扫码登录电台')
			if (closing || socket.readyState !== WebSocket.OPEN) return
			startNeteaseSync()
			// 这里只确认受理，最终成功必须等歌曲入库后由状态消息通知
			send(socket, { type: 'netease-sync-response', requestId, code: 202 })
		} catch (error: unknown) {
			send(socket, {
				type: 'netease-sync-response',
				requestId,
				code: error instanceof ApiError ? error.statusCode : 503,
				message: error instanceof ApiError ? error.message : '登录状态检查失败，请稍后重试'
			})
		} finally {
			syncChecking.delete(socket)
		}
	}

	server.on('error', error => fastify.log.warn({ err: error }, '电台实时管线异常'))
	server.on('connection', (socket, request) => {
		if (!isSameOrigin(request)) {
			socket.close(1008, '不允许跨站连接')
			return
		}
		let playbackQueue = Promise.resolve()
		alive.add(socket)
		requests.set(socket, request)
		socket.on('pong', () => alive.add(socket))
		socket.on('error', () => socket.terminate())
		// 首次连接发送配置、歌曲及主线快照
		send(socket, { type: 'radio-options', data: getRadioOptions() })
		send(socket, { type: 'radio-songs', data: getRoamingSongs() })
		send(socket, { type: 'playback-state', data: getMainPlayback() })
		sendSync(getNeteaseSyncState(), true, socket)

		socket.on('message', async (payload, binary) => {
			let message: unknown
			try {
				message = binary ? null : JSON.parse(payload.toString())
			} catch {
				socket.close(1008, '指令格式异常')
				return
			}
			if (!isRecord(message) || typeof message.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(message.requestId)) {
				socket.close(1008, '未知实时指令')
				return
			}
			const requestId = message.requestId
			if (
				message.type === 'playback-request' ||
				message.type === 'main-sync-request' ||
				message.type === 'playback-seek-request' ||
				message.type === 'playback-next-request' ||
				message.type === 'playback-pause-request'
			) {
				// 同一连接按收到的顺序处理选歌、开启同步和拖动进度
				const command = message
				playbackQueue = playbackQueue.then(() => {
					if (command.type === 'main-sync-request') return handleMainSyncRequest(socket, request, requestId, command)
					if (command.type === 'playback-seek-request') return handleSeekRequest(socket, request, requestId, command)
					if (command.type === 'playback-next-request') return handleNextRequest(socket, request, requestId, command)
					if (command.type === 'playback-pause-request') return handlePauseRequest(socket, requestId)
					return handlePlaybackRequest(socket, request, requestId, command)
				})
				await playbackQueue
			} else if (message.type === 'netease-sync-request' && Object.keys(message).length === 2) {
				await handleSyncRequest(socket, request, requestId)
			} else {
				socket.close(1008, '未知实时指令')
			}
		})
	})
	radioOptionsEvents.on('change', broadcastOptions)
	roamingSongsEvents.on('change', broadcastSongs)
	playbackEvents.on('change', broadcastPlayback)
	neteaseSyncEvents.on('change', sendSync)

	// 心跳清理断线客户端，让浏览器及时重连
	const timer = setInterval(() => {
		for (const socket of server.clients) {
			if (socket.readyState !== WebSocket.OPEN) continue
			if (!alive.has(socket)) {
				socket.terminate()
				continue
			}
			alive.delete(socket)
			socket.ping()
		}
	}, 30_000)
	timer.unref()

	fastify.addHook('preClose', async () => {
		closing = true
		clearInterval(timer)
		// 停止主线操作并解除广播监听，再关闭所有连接
		cancelScheduledMainPlayback()
		radioOptionsEvents.off('change', broadcastOptions)
		roamingSongsEvents.off('change', broadcastSongs)
		playbackEvents.off('change', broadcastPlayback)
		neteaseSyncEvents.off('change', sendSync)
		for (const socket of server.clients) socket.terminate()
		await pendingNotifications
		await new Promise<void>((resolve, reject) => {
			server.close(error => {
				if (error) reject(error)
				else resolve()
			})
		})
	})
}
