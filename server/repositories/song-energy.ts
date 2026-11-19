import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../utils/db.js'

export interface SongEnergy {
	sampleRate: number // 每秒包络帧数
	envelope: Buffer // 0–255 低频强度字节，时间从音源起点开始
}

// 保存歌曲的低频强度包络，同一首歌不随歌单刷新重复分析
export async function initSongEnergyRepository() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS roaming_song_energy (
			netease_uid VARCHAR(20) NOT NULL,
			song_id VARCHAR(20) NOT NULL,
			sample_rate SMALLINT UNSIGNED NOT NULL,
			envelope LONGBLOB NOT NULL,
			analyzed_at DATETIME NOT NULL,
			PRIMARY KEY (netease_uid, song_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
}

// 读取单首歌的包络，尚未分析时返回 null
export async function readSongEnergy(uid: string, songId: string): Promise<SongEnergy | null> {
	const [rows] = await pool.execute<RowDataPacket[]>('SELECT sample_rate, envelope FROM roaming_song_energy WHERE netease_uid = ? AND song_id = ? LIMIT 1', [uid, songId])
	const row = rows[0]
	if (!row || !Number.isFinite(row.sample_rate) || row.sample_rate <= 0 || !row.envelope?.length) return null
	return { sampleRate: row.sample_rate, envelope: row.envelope }
}

// 返回候选歌曲中还没有包络的 ID，避免每轮同步重复分析
export async function readSongIdsWithoutEnergy(uid: string, songIds: string[]): Promise<Set<string>> {
	const missing = new Set(songIds)
	for (let offset = 0; offset < songIds.length; offset += 200) {
		const chunk = songIds.slice(offset, offset + 200)
		const [rows] = await pool.query<RowDataPacket[]>('SELECT song_id FROM roaming_song_energy WHERE netease_uid = ? AND song_id IN (?)', [uid, chunk])
		for (const row of rows) missing.delete(String(row.song_id))
	}
	return missing
}

// 分析成功后覆盖写入，重复分析以最新结果为准
export async function replaceSongEnergy(uid: string, songId: string, energy: SongEnergy) {
	await pool.execute(
		`INSERT INTO roaming_song_energy (netease_uid, song_id, sample_rate, envelope, analyzed_at) VALUES (?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE sample_rate = VALUES(sample_rate), envelope = VALUES(envelope), analyzed_at = VALUES(analyzed_at)`,
		[uid, songId, energy.sampleRate, energy.envelope, new Date()]
	)
}
