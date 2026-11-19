import { and, eq, inArray } from 'drizzle-orm'
import type { LyricLine } from '@neon-radio/protocol'
import { db } from '../../platform/db.js'
import { songLyric } from '../../platform/schema.js'

// 返回 undefined 表示从未查询过，空数组表示已查询但没有歌词
export async function readLyricRow(uid: string, songId: string): Promise<LyricLine[] | undefined> {
	const [row] = await db.select({ lines: songLyric.lines }).from(songLyric).where(and(eq(songLyric.neteaseUid, uid), eq(songLyric.songId, songId))).limit(1)
	return row?.lines
}

export async function saveLyricRow(uid: string, songId: string, lines: LyricLine[]) {
	const fetchedAt = new Date()
	await db
		.insert(songLyric)
		.values({ neteaseUid: uid, songId, lines, fetchedAt })
		.onDuplicateKeyUpdate({ set: { lines, fetchedAt } })
}

// 删除已不在漫游列表中的歌词缓存，返回清理行数
export async function deleteUnreferencedLyricRows(uid: string, keep: ReadonlySet<string>) {
	const rows = await db.select({ songId: songLyric.songId }).from(songLyric).where(eq(songLyric.neteaseUid, uid))
	const stale = rows.map(row => row.songId).filter(songId => !keep.has(songId))
	for (let offset = 0; offset < stale.length; offset += 200) {
		await db
			.delete(songLyric)
			.where(and(eq(songLyric.neteaseUid, uid), inArray(songLyric.songId, stale.slice(offset, offset + 200))))
	}
	return stale.length
}
