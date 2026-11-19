import { and, eq, inArray } from 'drizzle-orm'
import type { ChorusRange } from '@neon-radio/protocol'
import { db } from '../../platform/db.js'
import { songChorus } from '../../platform/schema.js'

// 返回 undefined 表示从未查询过，null 表示已查询但没有副歌标注
export async function readChorusRow(uid: string, songId: string) {
	const [row] = await db
		.select({ startMs: songChorus.startMs, endMs: songChorus.endMs })
		.from(songChorus)
		.where(and(eq(songChorus.neteaseUid, uid), eq(songChorus.songId, songId)))
		.limit(1)
	return row
}

export async function saveChorusRow(uid: string, songId: string, range: ChorusRange | null) {
	const fetchedAt = new Date()
	const startMs = range?.startMs ?? null
	const endMs = range?.endMs ?? null
	await db
		.insert(songChorus)
		.values({ neteaseUid: uid, songId, startMs, endMs, fetchedAt })
		.onDuplicateKeyUpdate({ set: { startMs, endMs, fetchedAt } })
}

// 删除已不在漫游列表中的副歌缓存，返回清理行数
export async function deleteUnreferencedChorusRows(uid: string, keep: ReadonlySet<string>) {
	const rows = await db.select({ songId: songChorus.songId }).from(songChorus).where(eq(songChorus.neteaseUid, uid))
	const stale = rows.map(row => row.songId).filter(songId => !keep.has(songId))
	for (let offset = 0; offset < stale.length; offset += 200) {
		await db
			.delete(songChorus)
			.where(and(eq(songChorus.neteaseUid, uid), inArray(songChorus.songId, stale.slice(offset, offset + 200))))
	}
	return stale.length
}
