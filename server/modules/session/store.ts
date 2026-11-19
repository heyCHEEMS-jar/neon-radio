import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../platform/db.js'
import { browserSessions, neteaseSessions } from '../../platform/schema.js'

// 读取固定账号的加密登录态
export async function findNeteaseSessionRow(uid: string) {
	const [row] = await db
		.select({ cookieEnvelope: neteaseSessions.cookieEnvelope, updatedAt: neteaseSessions.updatedAt })
		.from(neteaseSessions)
		.where(eq(neteaseSessions.neteaseUid, uid))
		.limit(1)
	return row
}

export async function saveNeteaseSessionRow(uid: string, cookieEnvelope: Buffer, updatedAt: Date) {
	await db
		.insert(neteaseSessions)
		.values({ neteaseUid: uid, cookieEnvelope, updatedAt })
		.onDuplicateKeyUpdate({ set: { cookieEnvelope, updatedAt } })
}

// 新会话入库与旧 token 撤销共用事务，首次登录允许没有旧记录
export async function insertBrowserSessionRow(uid: string, tokenHash: Buffer, expiresAt: Date, previousTokenHash: Buffer | null) {
	await db.transaction(async tx => {
		await tx.delete(browserSessions).where(sql`${browserSessions.expiresAt} <= UTC_TIMESTAMP() OR ${browserSessions.tokenHash} = ${previousTokenHash}`)
		await tx.insert(browserSessions).values({ tokenHash, neteaseUid: uid, expiresAt })
	})
}

export async function hasStoredBrowserSession(uid: string, tokenHash: Buffer) {
	const [row] = await db
		.select({ tokenHash: browserSessions.tokenHash })
		.from(browserSessions)
		.where(and(eq(browserSessions.tokenHash, tokenHash), eq(browserSessions.neteaseUid, uid), sql`${browserSessions.expiresAt} > UTC_TIMESTAMP()`))
		.limit(1)
	return Boolean(row)
}

export async function deleteBrowserSessionRow(tokenHash: Buffer) {
	await db.delete(browserSessions).where(eq(browserSessions.tokenHash, tokenHash))
}

export async function deleteBrowserSessionsRow(uid: string) {
	await db.delete(browserSessions).where(eq(browserSessions.neteaseUid, uid))
}
