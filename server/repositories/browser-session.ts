import type { RowDataPacket } from 'mysql2/promise'
import { ensureSecondPrecision, pool } from '../utils/db.js'

export async function initBrowserSessionRepository() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS browser_sessions (
			token_hash BINARY(32) NOT NULL PRIMARY KEY,
			netease_uid VARCHAR(20) NOT NULL,
			expires_at DATETIME NOT NULL,
			INDEX (netease_uid),
			INDEX (expires_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	await ensureSecondPrecision('browser_sessions', 'expires_at')
}

// 新会话入库与旧 token 撤销共用事务，首次登录允许没有旧记录
export async function insertBrowserSession(uid: string, tokenHash: Buffer, expiresAt: number, previousTokenHash: Buffer | null) {
	const connection = await pool.getConnection()
	try {
		await connection.beginTransaction()
		await connection.execute('DELETE FROM browser_sessions WHERE expires_at <= UTC_TIMESTAMP() OR token_hash = ?', [previousTokenHash])
		await connection.execute('INSERT INTO browser_sessions (token_hash, netease_uid, expires_at) VALUES (?, ?, ?)', [
			tokenHash,
			uid,
			new Date(expiresAt)
		])
		await connection.commit()
	} catch (error: unknown) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

export async function hasStoredBrowserSession(uid: string, tokenHash: Buffer) {
	const [rows] = await pool.execute<RowDataPacket[]>(
		'SELECT 1 FROM browser_sessions WHERE token_hash = ? AND netease_uid = ? AND expires_at > UTC_TIMESTAMP() LIMIT 1',
		[tokenHash, uid]
	)
	return rows.length > 0
}

export async function deleteBrowserSession(tokenHash: Buffer) {
	await pool.execute('DELETE FROM browser_sessions WHERE token_hash = ?', [tokenHash])
}

export async function deleteBrowserSessions(uid: string) {
	await pool.execute('DELETE FROM browser_sessions WHERE netease_uid = ?', [uid])
}
