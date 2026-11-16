import type { RowDataPacket } from 'mysql2/promise'
import { ensureDatabase, ensureSecondPrecision, pool } from '../utils/db.js'

interface NeteaseSessionRow extends RowDataPacket {
	cookieEnvelope: Buffer
	updatedAt: string
}

export interface StoredNeteaseSession {
	cookieEnvelope: Buffer
	updatedAt: string
}

async function createSessionTable() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS netease_sessions (
			netease_uid VARCHAR(20) NOT NULL PRIMARY KEY,
			cookie_envelope MEDIUMBLOB NOT NULL,
			updated_at DATETIME NOT NULL
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	await ensureSecondPrecision('netease_sessions', 'updated_at')
}

function isMissingDatabaseError(error: unknown) {
	return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ER_BAD_DB_ERROR'
}

export async function initNeteaseSessionRepository() {
	try {
		await createSessionTable()
	} catch (error: unknown) {
		if (!isMissingDatabaseError(error)) throw error
		await ensureDatabase()
		await createSessionTable()
	}
}

export async function findNeteaseSession(uid: string): Promise<StoredNeteaseSession | null> {
	const [rows] = await pool.execute<NeteaseSessionRow[]>(
		`SELECT cookie_envelope AS cookieEnvelope,
			DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
		FROM netease_sessions
		WHERE netease_uid = ?
		LIMIT 1`,
		[uid]
	)
	const row = rows[0]
	return row ? { cookieEnvelope: row.cookieEnvelope, updatedAt: row.updatedAt } : null
}

export async function upsertNeteaseSession(uid: string, cookieEnvelope: Buffer, updatedAt: string) {
	await pool.execute(
		`INSERT INTO netease_sessions (netease_uid, cookie_envelope, updated_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE
			cookie_envelope = VALUES(cookie_envelope),
			updated_at = VALUES(updated_at)`,
		[uid, cookieEnvelope, updatedAt]
	)
}
