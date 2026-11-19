import type { NeteaseSyncState, PlaybackSnapshot, RadioOptions, RadioSong } from '@neon-radio/protocol'
import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { timelineEvents } from '../audio/index.js'
import { cancelScheduledMainPlayback, getMainPlayback, playbackEvents } from '../modules/playback/index.js'
import { songsEvents } from '../modules/roaming/index.js'
import { optionsEvents } from '../modules/settings/index.js'
import { neteaseSyncEvents } from '../modules/sync-state.js'
import type { LiveConnection, LivePool } from './connection.js'

interface Broadcasts {
	sendSync(state: NeteaseSyncState | null, snapshot?: boolean, target?: LiveConnection): void
	dispose(): void
	wait(): Promise<void>
}

// 业务事件到实时消息只在这里转换
export function bindBroadcasts(pool: LivePool, fastify: FastifyInstance): Broadcasts {
	let pending = Promise.resolve()

	// 本地连接不接收主线播放同步
	const broadcastPlayback = (snapshot: PlaybackSnapshot) => pool.broadcast({ type: 'playback-state', data: snapshot }, connection => !connection.local)
	// 下发已保存的配置；关闭同步时取消待执行操作并校准主线
	const broadcastOptions = (options: RadioOptions) => {
		pool.broadcast({ type: 'radio-options', data: options })
		if (!options.forceMainPlaybackSyncEnabled) {
			cancelScheduledMainPlayback()
			broadcastPlayback(getMainPlayback())
		}
	}
	// 歌曲列表继续发送给主线和本地连接
	const broadcastSongs = (songs: RadioSong[]) => pool.broadcast({ type: 'radio-songs', data: songs })
	// 分析完成只广播歌曲 ID，让当前歌曲的听众拉取新的时间轴
	const broadcastImpactsReady = (songId: string) => pool.broadcast({ type: 'radio-impacts-ready', data: songId })

	// 先捕获接收者，再串行下发，异步鉴权不会把旧状态排到新状态后面
	const sendSync = (state: NeteaseSyncState | null, snapshot = false, target?: LiveConnection) => {
		const targets = target ? [target] : [...pool.connections.values()]
		pending = pending
			.then(async () => {
				if (pool.closing) return
				const results = await Promise.allSettled(
					targets.map(async connection => {
						if (connection.socket.readyState !== WebSocket.OPEN) return
						if (await pool.authorize(connection)) pool.send(connection, { type: 'netease-sync', data: state, snapshot })
						else if (snapshot) pool.send(connection, { type: 'netease-sync', data: null, snapshot: true })
					})
				)
				if (results.some(result => result.status === 'rejected')) fastify.log.warn('网易云同步结果鉴权失败')
			})
			.catch(() => fastify.log.warn('网易云同步结果下发失败'))
	}

	optionsEvents.on('change', broadcastOptions)
	songsEvents.on('change', broadcastSongs)
	timelineEvents.on('ready', broadcastImpactsReady)
	playbackEvents.on('change', broadcastPlayback)
	neteaseSyncEvents.on('change', sendSync)

	return {
		sendSync,
		dispose() {
			optionsEvents.off('change', broadcastOptions)
			songsEvents.off('change', broadcastSongs)
			timelineEvents.off('ready', broadcastImpactsReady)
			playbackEvents.off('change', broadcastPlayback)
			neteaseSyncEvents.off('change', sendSync)
		},
		wait: () => pending
	}
}
