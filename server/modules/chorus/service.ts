import type { ChorusRange } from '@neon-radio/protocol'
import config from '../../config.js'
import { fetchChorus } from '../../platform/netease/chorus.js'
import { readChorusRow, saveChorusRow } from './store.js'

const pending = new Map<string, Promise<ChorusRange | null>>()
const cache = new Map<string, ChorusRange | null>()
const cacheLimit = 300

// 多个听众同时切到同一首歌时先命中进程缓存，减少数据库查询
function remember(songId: string, range: ChorusRange | null) {
	if (cache.size >= cacheLimit) {
		const oldest = cache.keys().next().value
		if (oldest) cache.delete(oldest)
	}
	cache.set(songId, range)
}

// 先查数据库，未查询过才请求网易云并按歌曲缓存结果
export async function getChorus(songId: string, cookie: string): Promise<ChorusRange | null> {
	if (cache.has(songId)) return cache.get(songId) ?? null

	const row = await readChorusRow(config.NETEASE_UID, songId)
	if (row) {
		const range = row.startMs !== null && row.endMs !== null && row.endMs > row.startMs ? { startMs: row.startMs, endMs: row.endMs } : null
		remember(songId, range)
		return range
	}

	const existing = pending.get(songId)
	if (existing) return existing

	// 同一首歌并发请求只打一次上游，失败不写缓存
	const task = (async () => {
		try {
			const range = await fetchChorus(songId, cookie)
			await saveChorusRow(config.NETEASE_UID, songId, range)
			remember(songId, range)
			return range
		} finally {
			pending.delete(songId)
		}
	})()
	pending.set(songId, task)
	return task
}
