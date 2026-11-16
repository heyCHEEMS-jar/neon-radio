import type { IncomingMessage } from 'node:http'
import type { FastifyInstance } from 'fastify'
import WebSocket, { WebSocketServer } from 'ws'
import { ApiError } from '../utils/api-error.js'
import { isRecord } from '../utils/object.js'
import { readBrowserToken } from '../http/browser-token.js'
import { hasBrowserSession } from '../services/session/browser-session.js'
import { getSessionStatus, startNeteaseSync } from '../services/session/netease-session.js'
import { getNeteaseSyncState, neteaseSyncEvents, type NeteaseSyncState } from '../services/radio/sync-state.js'
import { getRadioOptions, radioOptionsEvents, type RadioOptions } from '../services/radio/options.js'
import { getRoamingSongs, roamingSongsEvents, type RadioSong } from '../services/radio/roaming-sync.js'

// Next 代理会改写 Host，只信任本机代理转发的原始主机名
function isSameOrigin(request: IncomingMessage) {
	const forwardedHost = request.headers['x-forwarded-host']
	const proxied = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress || '')
	const host = proxied && typeof forwardedHost === 'string' ? forwardedHost.split(',')[0]?.trim() : request.headers.host
	if (!host || !request.headers.origin) return false
	try {
		const origin = new URL(request.headers.origin)
		return (origin.protocol === 'http:' || origin.protocol === 'https:') && origin.host === new URL(`${origin.protocol}//${host}`).host
	} catch {
		return false
	}
}

// 配置和歌曲列表公开下发，手动网易云同步的指令和结果都检查本站登录态
export default function initRadioLive(fastify: FastifyInstance) {
	const server = new WebSocketServer({ server: fastify.server, path: '/neon-radio/live', maxPayload: 4096 })
	const alive = new WeakSet<WebSocket>()
	const authenticated = new WeakSet<WebSocket>()
	const checking = new WeakSet<WebSocket>()
	const requests = new WeakMap<WebSocket, IncomingMessage>()
	let pendingNotifications = Promise.resolve()
	let closing = false

	const send = (socket: WebSocket, message: object) => {
		if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
	}
	const authorize = async (socket: WebSocket, request: IncomingMessage) => {
		const valid =
			isSameOrigin(request) && getSessionStatus().loggedIn && (await hasBrowserSession(readBrowserToken(request))) && getSessionStatus().loggedIn
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
	const broadcastOptions = (options: RadioOptions) => {
		for (const socket of server.clients) send(socket, { type: 'radio-options', data: options })
	}

	// 歌曲快照向所有连接公开广播，整份列表只序列化一次
	const broadcastSongs = (songs: RadioSong[]) => {
		if (closing) return
		const message = JSON.stringify({ type: 'radio-songs', data: songs })
		for (const socket of server.clients) {
			if (socket.readyState !== WebSocket.OPEN) continue
			try {
				socket.send(message)
			} catch {
				socket.terminate()
			}
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

	server.on('error', error => fastify.log.warn({ err: error }, '电台实时管线异常'))
	server.on('connection', (socket, request) => {
		alive.add(socket)
		requests.set(socket, request)
		socket.on('pong', () => alive.add(socket))
		socket.on('error', () => socket.terminate())
		send(socket, { type: 'radio-options', data: getRadioOptions() })
		send(socket, { type: 'radio-songs', data: getRoamingSongs() })
		sendSync(getNeteaseSyncState(), true, socket)

		socket.on('message', async (payload, binary) => {
			let message: unknown
			try {
				message = binary ? null : JSON.parse(payload.toString())
			} catch {
				socket.close(1008, '指令格式异常')
				return
			}
			if (
				!isRecord(message) ||
				message.type !== 'netease-sync-request' ||
				Object.keys(message).length !== 2 ||
				typeof message.requestId !== 'string' ||
				!/^[a-zA-Z0-9-]{1,64}$/.test(message.requestId)
			) {
				socket.close(1008, '未知同步指令')
				return
			}
			const requestId = message.requestId
			if (checking.has(socket)) {
				send(socket, { type: 'netease-sync-response', requestId, code: 429, message: '正在处理同步请求，请稍后重试' })
				return
			}
			checking.add(socket)
			try {
				if (!isSameOrigin(request)) throw new ApiError(403, '不允许跨站同步请求')
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
				checking.delete(socket)
			}
		})
	})
	radioOptionsEvents.on('change', broadcastOptions)
	roamingSongsEvents.on('change', broadcastSongs)
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
		radioOptionsEvents.off('change', broadcastOptions)
		roamingSongsEvents.off('change', broadcastSongs)
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
