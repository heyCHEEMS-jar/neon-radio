import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RowDataPacket } from 'mysql2/promise'
import config from '../config.js'
import { pool } from '../utils/db.js'

export interface BrowserSession {
	token: string
	expiresAt: number
}

export const browserSessionMaxAge = config.USER_SESSION_DAYS * 24 * 60 * 60

// 数据库只保存 token 哈希，不保存原始凭证
function hashToken(token: string) {
	return createHash('sha256').update(token).digest()
}

// 读取 token Cookie，仅检查格式，不验证登录
export function readBrowserToken(request: FastifyRequest) {
	const value = request.headers.cookie
		?.split(';')
		.map(item => item.trim())
		.find(item => item.startsWith('token='))
		?.slice(6)
	return value && /^[a-f0-9]{64}$/.test(value) ? value : ''
}

// 写入 HttpOnly token；未传会话时清除 Cookie
export function setBrowserToken(request: FastifyRequest, reply: FastifyReply, session?: BrowserSession) {
	const secure = request.protocol === 'https' || process.env.NODE_ENV === 'production'
	const maxAge = session ? Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) : 0
	reply.header('Set-Cookie', `token=${session?.token || ''}; Path=/neon-radio; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
}

// 初始化本站浏览器会话表
export async function initBrowserSessions() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS browser_sessions (
			token_hash BINARY(32) NOT NULL PRIMARY KEY,
			netease_uid VARCHAR(20) NOT NULL,
			expires_at DATETIME(3) NOT NULL,
			INDEX (netease_uid),
			INDEX (expires_at)
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
}

// 登录成功后创建新会话，并撤销当前浏览器的旧 token
export async function createBrowserSession(previousToken = ''): Promise<BrowserSession> {
	const session = { token: randomBytes(32).toString('hex'), expiresAt: Date.now() + browserSessionMaxAge * 1000 }
	const connection = await pool.getConnection()
	try {
		await connection.beginTransaction()
		await connection.execute('DELETE FROM browser_sessions WHERE expires_at <= UTC_TIMESTAMP(3) OR token_hash = ?', [
			previousToken ? hashToken(previousToken) : null
		])
		await connection.execute('INSERT INTO browser_sessions (token_hash, netease_uid, expires_at) VALUES (?, ?, ?)', [
			hashToken(session.token),
			config.NETEASE_UID,
			new Date(session.expiresAt)
		])
		await connection.commit()
		return session
	} catch (error: unknown) {
		await connection.rollback()
		throw error
	} finally {
		connection.release()
	}
}

// 检查 token 是否对应未过期的本站会话
export async function hasBrowserSession(token: string) {
	if (!token) return false
	const [rows] = await pool.execute<RowDataPacket[]>(
		'SELECT 1 FROM browser_sessions WHERE token_hash = ? AND netease_uid = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1',
		[hashToken(token), config.NETEASE_UID]
	)
	return rows.length > 0
}

// 只撤销当前 token 对应的本站会话
export async function revokeBrowserSession(token: string) {
	if (token) await pool.execute('DELETE FROM browser_sessions WHERE token_hash = ?', [hashToken(token)])
}

// 网易云登录失效时，撤销该账号下所有浏览器的本站会话
export async function revokeBrowserSessions() {
	await pool.execute('DELETE FROM browser_sessions WHERE netease_uid = ?', [config.NETEASE_UID])
}
