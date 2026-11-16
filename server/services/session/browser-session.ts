import { createHash, randomBytes } from 'node:crypto'
import config from '../../config.js'
import { deleteBrowserSession, deleteBrowserSessions, hasStoredBrowserSession, insertBrowserSession } from '../../repositories/browser-session.js'

export interface BrowserSession {
	token: string
	expiresAt: number
}

export const browserSessionMaxAge = config.USER_SESSION_DAYS * 24 * 60 * 60

// 数据库只保存 token 哈希，不保存原始凭证
function hashToken(token: string) {
	return createHash('sha256').update(token).digest()
}

// 登录成功后创建新会话，并撤销当前浏览器的旧 token
export async function createBrowserSession(previousToken = ''): Promise<BrowserSession> {
	const session = { token: randomBytes(32).toString('hex'), expiresAt: (Math.floor(Date.now() / 1000) + browserSessionMaxAge) * 1000 }
	await insertBrowserSession(config.NETEASE_UID, hashToken(session.token), session.expiresAt, previousToken ? hashToken(previousToken) : null)
	return session
}

export async function hasBrowserSession(token: string) {
	return Boolean(token) && (await hasStoredBrowserSession(config.NETEASE_UID, hashToken(token)))
}

// 只撤销当前 token 对应的本站会话
export async function revokeBrowserSession(token: string) {
	if (token) await deleteBrowserSession(hashToken(token))
}

// 网易云登录失效时，撤销该账号下所有浏览器的本站会话
export function revokeBrowserSessions() {
	return deleteBrowserSessions(config.NETEASE_UID)
}
