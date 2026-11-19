import type { AudioTimeline } from '@neon-radio/protocol'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../platform/db.js'
import { songImpacts } from '../platform/schema.js'

// 读取已保存的时间轴，写入侧已保证格式，这里只做映射
export async function readTimelineRow(uid: string, songId: string): Promise<AudioTimeline | null> {
	const [row] = await db
		.select({ analysisVersion: songImpacts.analysisVersion, durationMs: songImpacts.durationMs, impacts: songImpacts.impacts })
		.from(songImpacts)
		.where(and(eq(songImpacts.neteaseUid, uid), eq(songImpacts.songId, songId)))
		.limit(1)
	return row ?? null
}

// 分批找出缺失或版本过期的时间轴，触发后台补齐和重算
export async function findMissingTimelineIds(uid: string, songIds: string[], version: number) {
	const missing = new Set(songIds)
	for (let offset = 0; offset < songIds.length; offset += 200) {
		const rows = await db
			.select({ songId: songImpacts.songId })
			.from(songImpacts)
			.where(and(eq(songImpacts.neteaseUid, uid), inArray(songImpacts.songId, songIds.slice(offset, offset + 200)), eq(songImpacts.analysisVersion, version)))
		for (const row of rows) missing.delete(row.songId)
	}
	return missing
}

// 删除不再出现在漫游列表中的时间轴，避免歌曲下线后残留数据
export async function deleteUnreferencedTimelines(uid: string, keep: ReadonlySet<string>) {
	const rows = await db.select({ songId: songImpacts.songId }).from(songImpacts).where(eq(songImpacts.neteaseUid, uid))
	const stale = rows.map(row => row.songId).filter(songId => !keep.has(songId))
	for (let offset = 0; offset < stale.length; offset += 200) {
		await db
			.delete(songImpacts)
			.where(and(eq(songImpacts.neteaseUid, uid), inArray(songImpacts.songId, stale.slice(offset, offset + 200))))
	}
	return stale.length
}

// 新版分析成功后整首覆盖入库，失败不清空已有结果
export async function saveTimelineRow(uid: string, songId: string, timeline: AudioTimeline) {
	const analyzedAt = new Date()
	await db
		.insert(songImpacts)
		.values({
			neteaseUid: uid,
			songId,
			analysisVersion: timeline.analysisVersion,
			durationMs: timeline.durationMs,
			impacts: timeline.impacts,
			analyzedAt
		})
		.onDuplicateKeyUpdate({
			set: { analysisVersion: timeline.analysisVersion, durationMs: timeline.durationMs, impacts: timeline.impacts, analyzedAt }
		})
}
