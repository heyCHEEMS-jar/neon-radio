import type { RowDataPacket } from 'mysql2/promise'
import { AUDIO_ANALYSIS_VERSION, type AudioImpactTimeline } from '../integrations/audio-analysis.js'
import { pool } from '../utils/db.js'
import { isRecord } from '../utils/object.js'

interface SongImpactsRow extends RowDataPacket {
	analysis_version: number
	duration_ms: number
	impacts: unknown
}

// 保存音频时间轴，算法版本用于识别需要后台重算的结果
export async function initSongImpactsRepository() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS roaming_song_impacts (
			netease_uid VARCHAR(20) NOT NULL,
			song_id VARCHAR(20) NOT NULL,
			analysis_version SMALLINT UNSIGNED NOT NULL DEFAULT 0,
			duration_ms INT UNSIGNED NOT NULL,
			impacts JSON NOT NULL,
			analyzed_at DATETIME NOT NULL,
			PRIMARY KEY (netease_uid, song_id)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	// 已有数据只补充版本字段，保留时间轴直到新版分析成功覆盖
	const [columns] = await pool.execute<RowDataPacket[]>(
		'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
		['roaming_song_impacts', 'analysis_version']
	)
	if (!columns.length) await pool.query('ALTER TABLE roaming_song_impacts ADD COLUMN analysis_version SMALLINT UNSIGNED NOT NULL DEFAULT 0')
}

// 读取已保存的时间轴，后台重算期间仍可使用已有真实起音点
export async function readSongImpacts(uid: string, songId: string): Promise<AudioImpactTimeline | null> {
	const [rows] = await pool.execute<SongImpactsRow[]>(
		'SELECT analysis_version, duration_ms, impacts FROM roaming_song_impacts WHERE netease_uid = ? AND song_id = ? LIMIT 1',
		[uid, songId]
	)
	const row = rows[0]
	if (!row) return null
	if (!Number.isFinite(row.duration_ms) || row.duration_ms <= 0 || !Array.isArray(row.impacts)) throw new Error('已入库的震动时间轴格式异常')
	// 只下发合法且严格递增的音源时间点，保留每点的原始强度
	let previousTime = -1
	const impacts = row.impacts.map((point: unknown) => {
		if (
			!isRecord(point) ||
			typeof point.timeMs !== 'number' || !Number.isInteger(point.timeMs) || point.timeMs < 0 || point.timeMs <= previousTime || point.timeMs > row.duration_ms ||
			typeof point.strength !== 'number' || !Number.isFinite(point.strength) || point.strength <= 0
		) throw new Error('已入库的震动时间点格式异常')
		previousTime = point.timeMs
		return { timeMs: point.timeMs, strength: point.strength }
	})
	return { analysisVersion: row.analysis_version, durationMs: row.duration_ms, impacts }
}

// 分批找出缺失或版本过期的时间轴，触发后台补齐和重算
export async function readSongIdsWithoutImpacts(uid: string, songIds: string[]): Promise<Set<string>> {
	const missing = new Set(songIds)
	for (let offset = 0; offset < songIds.length; offset += 200) {
		const chunk = songIds.slice(offset, offset + 200)
		const [rows] = await pool.query<RowDataPacket[]>(
			'SELECT song_id FROM roaming_song_impacts WHERE netease_uid = ? AND song_id IN (?) AND analysis_version = ?',
			[uid, chunk, AUDIO_ANALYSIS_VERSION]
		)
		for (const row of rows) missing.delete(String(row.song_id))
	}
	return missing
}

// 新版分析成功后整首覆盖入库，失败不清空已有结果
export async function replaceSongImpacts(uid: string, songId: string, timeline: AudioImpactTimeline) {
	await pool.execute(
		`INSERT INTO roaming_song_impacts (netease_uid, song_id, analysis_version, duration_ms, impacts, analyzed_at) VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE analysis_version = VALUES(analysis_version), duration_ms = VALUES(duration_ms),
			impacts = VALUES(impacts), analyzed_at = VALUES(analyzed_at)`,
		[uid, songId, timeline.analysisVersion, timeline.durationMs, JSON.stringify(timeline.impacts), new Date()]
	)
}
