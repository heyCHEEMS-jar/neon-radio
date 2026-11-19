import { createHash } from 'node:crypto'
import type { RadioSong } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'
import { asc, eq } from 'drizzle-orm'
import { db } from '../../platform/db.js'
import { roamingSongs } from '../../platform/schema.js'

// 完整抓取后事务替换列表，失败时回滚并保留上次数据
export async function replaceRoamingSongs(uid: string, songs: ReadonlyMap<string, Record<string, unknown>>) {
	const syncedAt = new Date(Math.floor(Date.now() / 1000) * 1000)
	const rows = Array.from(songs, ([identity, song], sortOrder) => ({
		neteaseUid: uid,
		songKey: createHash('sha256').update(identity).digest('hex'),
		sortOrder,
		song,
		syncedAt
	}))
	await db.transaction(async tx => {
		await tx.delete(roamingSongs).where(eq(roamingSongs.neteaseUid, uid))
		// 分批写入，避免总列表过大导致单条 SQL 超限
		for (let offset = 0; offset < rows.length; offset += 200) {
			await tx.insert(roamingSongs).values(rows.slice(offset, offset + 200))
		}
	})
}

// 网易云原始歌曲详情只在入库时出现，对外统一成卡片字段
function toRadioSong(song: Record<string, unknown>): RadioSong {
	const album = isRecord(song.al) ? song.al : null
	return {
		id: String(song.id),
		name: typeof song.name === 'string' ? song.name.trim() : '',
		artists: Array.isArray(song.ar) ? song.ar.filter(isRecord).map(artist => String(artist.name ?? '').trim()).filter(Boolean) : [],
		picUrl: typeof album?.picUrl === 'string' ? album.picUrl : '',
		durationMs: typeof song.dt === 'number' && Number.isFinite(song.dt) && song.dt >= 0 ? song.dt : 0
	}
}

// 按入库顺序读取卡片字段，不向前端透传完整网易云歌曲详情
export async function readRoamingSongs(uid: string): Promise<RadioSong[]> {
	const rows = await db
		.select({ song: roamingSongs.song })
		.from(roamingSongs)
		.where(eq(roamingSongs.neteaseUid, uid))
		.orderBy(asc(roamingSongs.sortOrder))
	return rows.map(({ song }) => toRadioSong(song))
}
