import type { RadioListeners } from '@neon-radio/protocol'
import WebSocket from 'ws'
import { getMainPlayback, playbackEvents } from '../modules/playback/index.js'
import type { LiveConnection, LivePool } from './connection.js'

// 合并同一登录会话的多个标签页，游客没有会话 token 时按连接各自计数
function groupViewers(pool: LivePool) {
	const viewers = new Map<string | WebSocket, LiveConnection[]>()
	for (const connection of pool.connections.values()) {
		const key = connection.token || connection.socket
		const group = viewers.get(key)
		if (group) group.push(connection)
		else viewers.set(key, [connection])
	}
	return viewers
}

// 在线人数按人去重，在听人数只统计真正在播放的人：本地播放优先，其余跟随主线
export function collectListeners(pool: LivePool): RadioListeners {
	const mainId = getMainPlayback().song?.id
	const counts = new Map<string, number>()
	const viewers = groupViewers(pool)
	for (const group of viewers.values()) {
		const playing = group.find(connection => connection.playing)
		if (!playing) continue
		const songId = playing.local?.song?.id ?? mainId
		if (songId) counts.set(songId, (counts.get(songId) ?? 0) + 1)
	}
	const songs = Array.from(counts, ([songId, listeners]) => ({ songId, listeners })).sort((left, right) => right.listeners - left.listeners)
	return { online: viewers.size, songs }
}

// 合并短时间内的多次变化，避免每首歌切换都触发一轮广播
export function bindListeners(pool: LivePool) {
	let timer: ReturnType<typeof setTimeout> | null = null

	// 延迟后广播最新人数，定时器不允许拖住进程退出
	const schedule = () => {
		if (timer || pool.closing) return
		timer = setTimeout(() => {
			timer = null
			pool.broadcast({ type: 'radio-listeners', data: collectListeners(pool) })
		}, 300)
		timer.unref()
	}

	const onPlayback = () => schedule()
	playbackEvents.on('change', onPlayback)
	return {
		schedule,
		dispose() {
			if (timer) clearTimeout(timer)
			playbackEvents.off('change', onPlayback)
		}
	}
}
