import { createHash } from 'node:crypto'
import { ensureSecondPrecision, pool } from '../utils/db.js'

// 保存账号的总漫游列表，歌曲详情中保留歌手、专辑和封面
export async function initRoamingSongRepository() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS roaming_songs (
			netease_uid VARCHAR(20) NOT NULL,
			song_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
			sort_order INT UNSIGNED NOT NULL,
			song JSON NOT NULL,
			synced_at DATETIME NOT NULL,
			PRIMARY KEY (netease_uid, song_key),
			INDEX (netease_uid, sort_order)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	await ensureSecondPrecision('roaming_songs', 'synced_at')
}

// 完整抓取后事务替换列表，失败时回滚并保留上次数据
export async function replaceRoamingSongs(uid: string, songs: ReadonlyMap<string, Record<string, unknown>>) {
	const syncedAt = new Date(Math.floor(Date.now() / 1000) * 1000)
	const rows = Array.from(songs, ([identity, song], sortOrder) => [
		uid,
		createHash('sha256').update(identity).digest('hex'),
		sortOrder,
		JSON.stringify(song),
		syncedAt
	])
	const connection = await pool.getConnection()
	try {
		await connection.beginTransaction()
		await connection.execute('DELETE FROM roaming_songs WHERE netease_uid = ?', [uid])
		// 分批写入，避免总列表过大导致单条 SQL 超限
		for (let offset = 0; offset < rows.length; offset += 200) {
			await connection.query('INSERT INTO roaming_songs (netease_uid, song_key, sort_order, song, synced_at) VALUES ?', [
				rows.slice(offset, offset + 200)
			])
		}
		await connection.commit()
	} catch (error: unknown) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}
