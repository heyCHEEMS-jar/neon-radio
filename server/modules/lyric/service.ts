import type { LyricLine } from '@neon-radio/protocol'
import config from '../../config.js'
import { fetchLyric } from '../../platform/netease/lyric.js'
import { readLyricRow, saveLyricRow } from './store.js'

const pending = new Map<string, Promise<LyricLine[]>>()
const cache = new Map<string, LyricLine[]>()
const cacheLimit = 300

// 多个听众同时切到同一首歌时先命中进程缓存，减少数据库查询
function remember(songId: string, lines: LyricLine[]) {
	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value
		if (oldest) cache.delete(oldest)
	}
	cache.set(songId, lines)
}

// 先查数据库，未查询过才请求网易云并按歌曲缓存结果
export async function getLyric(songId: string, cookie: string): Promise<LyricLine[]> {
	const memory = cache.get(songId)
	if (memory) return memory

	const cached = await readLyricRow(config.NETEASE_UID, songId)
	if (cached) {
		remember(songId, cached)
		return cached
	}

	const existing = pending.get(songId)
	if (existing) return existing

	// 同一首歌并发请求只打一次上游，失败不写缓存
	const task = (async () => {
		try {
			const lines = await fetchLyric(songId, cookie)
			await saveLyricRow(config.NETEASE_UID, songId, lines)
			remember(songId, lines)
			return lines
		} finally {
			pending.delete(songId)
		}
	})()
	pending.set(songId, task)
	return task
}
