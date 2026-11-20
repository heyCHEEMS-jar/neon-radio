import { randomUUID } from 'node:crypto'
import type { LiveCommand, PlaybackSnapshot, RadioSong } from '@neon-radio/protocol'
import WebSocket from 'ws'
import { cancelScheduledMainPlayback, createLocalPlayback, getMainPlayback, getNextSong, scheduleMainPlayback, syncMainPlayback } from '../../modules/playback/index.js'
import { getRoamingSongs } from '../../modules/roaming/index.js'
import { getRadioOptions, updateRadioOption } from '../../modules/settings/index.js'
import { AppError } from '../../platform/errors.js'
import type { LiveConnection, LivePool } from '../connection.js'
import { respondError } from '../respond.js'

type PlaybackRequest = Extract<LiveCommand, { type: 'playback-request' }>
type SeekRequest = Extract<LiveCommand, { type: 'playback-seek-request' }>
type NextRequest = Extract<LiveCommand, { type: 'playback-next-request' }>
type PauseRequest = Extract<LiveCommand, { type: 'playback-pause-request' }>
type MainSyncRequest = Extract<LiveCommand, { type: 'main-sync-request' }>

// 选歌：先校验身份和配置，再决定走主线防抖还是当前连接的本地播放
export async function handlePlaybackRequest(pool: LivePool, connection: LiveConnection, command: PlaybackRequest) {
	if (pool.closing) return
	try {
		// 先校验指令和管理员身份，鉴权后再读取最新配置
		const authorized = command.mode === 'local' || getRadioOptions().forceMainPlaybackSyncEnabled ? await pool.authorize(connection) : false
		if (pool.closing) return
		const options = getRadioOptions()

		// 点歌必须仍在有效列表内；游客只受游客漫游开关约束
		let song: RadioSong | null = null
		if (command.mode === 'local') {
			if (!authorized && !options.guestRoamingEnabled) throw new AppError(401, { key: 'auth.loginRequired' })
			song = getRoamingSongs().find(item => item.id === command.songId) ?? null
			if (!song) throw new AppError(404, { key: 'roaming.songMissing' })
			if (!Number.isFinite(song.durationMs) || song.durationMs <= 0) throw new AppError(422, { key: 'playback.invalidDuration' })
		}

		if (authorized && options.forceMainPlaybackSyncEnabled && (command.mode === 'main' || !command.playbackId)) {
			// 选歌和回主线共用服务端防抖，断线不取消已受理操作
			connection.local = null
			scheduleMainPlayback(song)
			pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 202, mode: 'main' })
			return
		}

		// 普通点歌及断线恢复仅修改当前连接，回主线读取此刻快照
		let snapshot: PlaybackSnapshot
		if (song && command.mode === 'local') {
			snapshot = await createLocalPlayback(song, command)
			if (pool.closing || connection.socket.readyState !== WebSocket.OPEN) return
			if (!authorized && !getRadioOptions().guestRoamingEnabled) throw new AppError(401, { key: 'roaming.guestDisabled' })
			connection.local = snapshot
		} else {
			connection.local = null
			snapshot = getMainPlayback()
		}
		pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 200, data: snapshot })
	} catch (error: unknown) {
		respondError(pool, connection, 'playback-response', command.requestId, error, { key: 'playback.requestFailed' })
	}
}

// 手动暂停只冻结当前主线为本地状态，不影响其他听众，也不允许借暂停任意选歌
export function handlePauseRequest(pool: LivePool, connection: LiveConnection, command: PauseRequest) {
	if (pool.closing) return
	const current = connection.local ?? getMainPlayback()
	if (!current.song) {
		pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 404, message: { key: 'playback.nothingToPause' } })
		return
	}
	const snapshot: PlaybackSnapshot = { ...current, mode: 'local', playbackId: randomUUID(), paused: true }
	connection.local = snapshot
	pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 200, data: snapshot })
}

// 本地音源结束后继续下一首，自动续播不触发管理员强制改主线
export async function handleNextRequest(pool: LivePool, connection: LiveConnection, command: NextRequest) {
	if (pool.closing) return
	try {
		// 只有当前本地实例可以申请续播
		const current = connection.local
		if (!current?.song || current.playbackId !== command.playbackId) throw new AppError(409, { key: 'playback.instanceChanged' })
		const authorized = await pool.authorize(connection)
		let snapshot: PlaybackSnapshot | null = null
		if (authorized || getRadioOptions().guestRoamingEnabled) {
			const next = getNextSong(current.song, command.order, !command.manual)
			if (next) snapshot = await createLocalPlayback(next)
		}
		if (pool.closing || connection.socket.readyState !== WebSocket.OPEN) return
		if (snapshot?.song && (authorized || getRadioOptions().guestRoamingEnabled) && getRoamingSongs().some(song => song.id === snapshot?.song?.id)) {
			connection.local = snapshot
			pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 200, data: snapshot })
			return
		}
		// 游客漫游被关闭或列表已空时继续收听主线，不停在曲目末尾
		connection.local = null
		pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 202, mode: 'main' })
		pool.send(connection, { type: 'playback-state', data: getMainPlayback() })
	} catch (error: unknown) {
		respondError(pool, connection, 'playback-response', command.requestId, error, { key: 'playback.nextFailed' })
	}
}

// 拖动进度按管理员身份和开关决定主线同步或本地漫游
export async function handleSeekRequest(pool: LivePool, connection: LiveConnection, command: SeekRequest) {
	if (pool.closing) return
	try {
		// 鉴权后再读取最新实例，旧歌曲的拖动不能覆盖新歌曲
		const authorized = await pool.authorize(connection)
		if (pool.closing) return
		const options = getRadioOptions()
		if (!authorized && !options.guestRoamingEnabled) throw new AppError(401, { key: 'roaming.guestDisabled' })
		const current = connection.local ?? getMainPlayback()
		if (!current.song || current.mode !== command.sourceMode || current.playbackId !== command.playbackId) {
			throw new AppError(409, { key: 'playback.songChanged' })
		}
		const positionMs = Math.min(current.song.durationMs, command.positionMs)
		if (authorized && options.forceMainPlaybackSyncEnabled) {
			// 主线定位立即广播，复用接管逻辑取消旧的防抖选歌
			connection.local = null
			pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 202, mode: 'main' })
			syncMainPlayback(current.song, positionMs)
			return
		}
		// 普通拖动原子切换到连接私有的本地播放，不修改主线
		const snapshot = await createLocalPlayback(current.song, { playbackId: randomUUID(), positionMs, paused: command.paused })
		if (pool.closing || connection.socket.readyState !== WebSocket.OPEN) return
		if (!authorized && !getRadioOptions().guestRoamingEnabled) throw new AppError(401, { key: 'roaming.guestDisabled' })
		if ((connection.local ?? getMainPlayback()).playbackId !== current.playbackId) throw new AppError(409, { key: 'playback.songChanged' })
		connection.local = snapshot
		pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 200, data: snapshot })
	} catch (error: unknown) {
		respondError(pool, connection, 'playback-response', command.requestId, error, { key: 'playback.seekFailed' })
	}
}

// 开启同步并立即推送发起管理员的歌曲和进度，不等待再次选歌
export async function handleMainSyncRequest(pool: LivePool, connection: LiveConnection, command: MainSyncRequest) {
	if (pool.closing) return
	try {
		// 记录接收时间以补偿鉴权和保存期间的进度
		const receivedAt = performance.now()
		// 只有管理员可以开启同步，歌曲必须仍在有效漫游列表内
		if (!(await pool.authorize(connection))) throw new AppError(401, { key: 'auth.loginRequired' })
		if (pool.closing) return
		const requested = command.playback
		const song = requested === null ? null : (getRoamingSongs().find(item => item.id === requested.songId) ?? null)
		if (requested !== null && !song) throw new AppError(404, { key: 'roaming.currentSongMissing' })
		if (song && (!Number.isFinite(song.durationMs) || song.durationMs <= 0)) throw new AppError(422, { key: 'playback.currentInvalidDuration' })
		const positionMs = song ? Math.min(song.durationMs, requested?.positionMs ?? 0) : 0

		// 先保存并广播开关，保存失败时不修改主线播放
		await updateRadioOption('forceMainPlaybackSyncEnabled', true)
		if (pool.closing) return
		// 发起页面离开本地路线，接管进度并向主线听众立即广播
		connection.local = null
		const snapshot = syncMainPlayback(song, positionMs + performance.now() - receivedAt)
		pool.send(connection, { type: 'playback-response', requestId: command.requestId, code: 200, data: snapshot })
	} catch (error: unknown) {
		respondError(pool, connection, 'playback-response', command.requestId, error, { key: 'playback.mainSyncFailed' })
	}
}

// 停止服务前取消待执行的主线操作
export function cancelPendingPlayback() {
	cancelScheduledMainPlayback()
}
