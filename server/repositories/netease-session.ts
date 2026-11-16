import type { RowDataPacket } from 'mysql2/promise'
import { isNeteaseCookie } from '../utils/cookie.js'
import { formatUtcTimestamp } from '../utils/date.js'
import { ensureDatabase, ensureSecondPrecision, pool } from '../utils/db.js'
import { decryptNeteaseSessionCookie, encryptNeteaseSessionCookie } from '../utils/netease-session-crypto.js'
import { isRecord } from '../utils/object.js'
import { readLegacyNeteaseSession, removeLegacyNeteaseFiles, removeLegacyNeteaseTempFile } from './legacy-netease-session.js'

interface NeteaseSessionRow extends RowDataPacket {
	cookieEnvelope: Buffer
	updatedAt: string
}

interface RestoredNeteaseSession {
	cookie: string
	updatedAt: string | null
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

export async function initNeteaseSessionRepository() {
	try {
		await createSessionTable()
	} catch (error: unknown) {
		if (!isRecord(error) || error.code !== 'ER_BAD_DB_ERROR') throw error
		await ensureDatabase()
		await createSessionTable()
	}
}

async function findNeteaseSession(uid: string) {
	const [rows] = await pool.execute<NeteaseSessionRow[]>(
		`SELECT cookie_envelope AS cookieEnvelope,
			DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updatedAt
		FROM netease_sessions WHERE netease_uid = ? LIMIT 1`,
		[uid]
	)
	return rows[0]
}

async function upsertNeteaseSession(uid: string, cookieEnvelope: Buffer, updatedAt: string) {
	await pool.execute(
		`INSERT INTO netease_sessions (netease_uid, cookie_envelope, updated_at)
		VALUES (?, ?, ?)
		ON DUPLICATE KEY UPDATE cookie_envelope = VALUES(cookie_envelope), updated_at = VALUES(updated_at)`,
		[uid, cookieEnvelope, updatedAt]
	)
}

function validateUpdatedAt(value: unknown) {
	if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
		throw new Error('数据库中的网易云登录态时间格式异常')
	}
	const parsed = new Date(`${value.replace(' ', 'T')}Z`)
	if (Number.isNaN(parsed.getTime()) || formatUtcTimestamp(parsed) !== value) throw new Error('数据库中的网易云登录态时间格式异常')
	return value
}

// 恢复数据库密文，旧文件只在成功入库后清理
export async function restoreNeteaseSession(uid: string, key: Buffer): Promise<RestoredNeteaseSession> {
	const stored = await findNeteaseSession(uid)
	if (stored) {
		if (!Buffer.isBuffer(stored.cookieEnvelope)) throw new Error('数据库中的网易云登录态密文格式异常')
		const cookie = decryptNeteaseSessionCookie(stored.cookieEnvelope, uid, key)
		if (!isNeteaseCookie(cookie, true)) throw new Error('数据库中的网易云登录态 Cookie 格式异常')
		const updatedAt = validateUpdatedAt(stored.updatedAt)
		await removeLegacyNeteaseFiles()
		return { cookie, updatedAt }
	}

	const legacy = await readLegacyNeteaseSession(uid)
	if (!legacy) {
		await removeLegacyNeteaseTempFile()
		return { cookie: '', updatedAt: null }
	}
	await upsertNeteaseSession(uid, encryptNeteaseSessionCookie(legacy.cookie, uid, key), legacy.updatedAt)
	await removeLegacyNeteaseFiles()
	return legacy
}

export async function saveNeteaseSession(uid: string, cookie: string, key: Buffer) {
	const updatedAt = formatUtcTimestamp(new Date())
	await upsertNeteaseSession(uid, encryptNeteaseSessionCookie(cookie, uid, key), updatedAt)
	return updatedAt
}
