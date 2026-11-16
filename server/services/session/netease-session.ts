import { randomUUID } from 'node:crypto'
import config, { validateConfig } from '../../config.js'
import { readNeteaseAccount, refreshNeteaseCookie } from '../../integrations/netease/auth.js'
import { initBrowserSessionRepository } from '../../repositories/browser-session.js'
import { initNeteaseSessionRepository, restoreNeteaseSession, saveNeteaseSession } from '../../repositories/netease-session.js'
import { ApiError } from '../../utils/api-error.js'
import { isNeteaseCookie } from '../../utils/cookie.js'
import { decodeNeteaseSessionKey } from '../../utils/netease-session-crypto.js'
import { isRecord } from '../../utils/object.js'
import { getNeteaseSyncState, publishNeteaseSync, readNeteaseSyncError } from '../radio/sync-state.js'
import { publishRoamingSongs, scheduleRoamingSync } from '../radio/roaming-sync.js'
import { createBrowserSession, revokeBrowserSessions } from './browser-session.js'

let cookie = ''
let updatedAt: string | null = null
let encryptionKey: Buffer | null = null
let pendingUpdate = Promise.resolve()
let verifiedUntil = 0
let verification: Promise<boolean> | null = null
let refresh: Promise<void> | null = null
let refreshSyncId: string | null = null

// 串行更新网易云凭证，避免登录、刷新和失效清理互相覆盖
function updateSession<T>(update: () => Promise<T>) {
	const next = pendingUpdate.then(update)
	pendingUpdate = next.then(() => {}, () => {})
	return next
}

// 清空网易云凭证时先撤销本站会话，存储成功后再发布内存状态
async function persistCookie(value: string) {
	if (!encryptionKey) throw new Error('网易云登录态尚未初始化')
	// 避免网易云重新登录后旧 token 自动恢复有效
	if (!value) await revokeBrowserSessions()
	const savedAt = await saveNeteaseSession(config.NETEASE_UID, value, encryptionKey)
	cookie = value
	updatedAt = savedAt
	verifiedUntil = 0
}

// 校验凭证和固定账号，原始接口响应由适配层处理
async function validateCookie(value: string) {
	if (!isNeteaseCookie(value)) throw new ApiError(401, '网易云登录 Cookie 无效')
	const account = await readNeteaseAccount(value)
	if (account.uid !== config.NETEASE_UID) throw new ApiError(403, '扫码账号与电台 UID 不匹配，原登录态未更改')
	if (!isNeteaseCookie(account.cookie)) throw new ApiError(401, '网易云登录已失效')
	return account.cookie
}

// 初始化存储并恢复服务端保存的网易云登录
export async function initSession() {
	validateConfig()
	const key = decodeNeteaseSessionKey(config.NETEASE_COOKIE_ENCRYPTION_KEY)
	await initNeteaseSessionRepository()
	await initBrowserSessionRepository()
	const restored = await restoreNeteaseSession(config.NETEASE_UID, key)
	encryptionKey = key
	cookie = restored.cookie
	updatedAt = restored.updatedAt
	verifiedUntil = 0
	if (!cookie) await revokeBrowserSessions()
}

// 返回电台账号的登录概况，不代表当前浏览器已经登录
export function getSessionStatus() {
	return { uid: config.NETEASE_UID, loggedIn: Boolean(cookie), updatedAt }
}

// 读取服务端网易云凭证，未登录时拒绝请求
export function getSessionCookie() {
	if (!cookie) throw new ApiError(401, '请打开登录弹窗扫码登录电台账号')
	return cookie
}

// 登录会话创建成功后触发独立的后台歌曲同步
export function saveSessionCookie(value: string, previousToken = '') {
	return updateSession(async () => {
		const validatedCookie = await validateCookie(value.trim())
		await persistCookie(validatedCookie)
		const session = await createBrowserSession(previousToken)
		scheduleRoamingSync(cookie)
		return session
	})
}

function isExpiredCookie(error: unknown) {
	const body = isRecord(error) && isRecord(error.body) ? error.body : undefined
	const data = isRecord(body?.data) ? body.data : undefined
	const codes = [body?.code, data?.code, error instanceof ApiError ? error.statusCode : undefined]
	return codes.some(code => code === 301 || code === 401 || code === 403)
}

// 短缓存并合并登录校验，确认失效时撤销本站会话
export function verifySession() {
	if (verification) return verification
	if (verifiedUntil > Date.now()) return Promise.resolve(true)

	verification = updateSession(async () => {
		if (!cookie) return false
		try {
			await validateCookie(cookie)
			verifiedUntil = Date.now() + 30_000
			return true
		} catch (error: unknown) {
			if (!isExpiredCookie(error)) throw error
			await persistCookie('')
			return false
		}
	}).finally(() => {
		verification = null
	})
	return verification
}

// 携带网易云 Cookie 请求数据，明确失效才撤销会话，旧请求不影响新登录
export async function withSessionCookie<T extends { body: { code: number } }>(request: (value: string) => Promise<T>) {
	const current = getSessionCookie()
	try {
		const response = await request(current)
		if (response.body.code !== 200) throw response
		return response
	} catch (error: unknown) {
		const body = isRecord(error) && isRecord(error.body) ? error.body : undefined
		if (typeof body?.code === 'number' && [301, 401].includes(body.code)) {
			await updateSession(async () => {
				if (cookie === current) await persistCookie('')
			})
		}
		throw error
	}
}

// 手动任务共用一个标识，重复点击只订阅当前任务，不重复触发同步
export function startNeteaseSync() {
	getSessionCookie()
	const current = getNeteaseSyncState()
	if (current?.phase === 'refreshing' || current?.phase === 'syncing') return current
	const state = publishNeteaseSync({ id: randomUUID(), phase: 'refreshing', message: '正在刷新网易云 Cookie…' })
	refreshSession(state.id).catch(() => console.warn('[漫游同步] 手动刷新网易云 Cookie 失败'))
	return state
}

// 刷新 Cookie 并触发漫游同步，合并同时到来的手动和定时刷新
export function refreshSession(syncId: string | null = null) {
	if (syncId) refreshSyncId = syncId
	if (refresh) return refresh
	refresh = updateSession(async () => {
		// 请求网易云前先推旧列表，推送失败不阻止凭证刷新和后台同步
		await publishRoamingSongs().catch(() => console.warn('[漫游同步] 旧歌曲列表推送失败，继续刷新'))
		let refreshError: string | null = null
		try {
			if (!cookie) {
				refreshError = '网易云登录已失效，请重新扫码'
				return
			}
			const refreshedCookie = await refreshNeteaseCookie(cookie)
			const validatedCookie = await validateCookie(refreshedCookie)
			await persistCookie(validatedCookie)
		} catch (error: unknown) {
			refreshError = readNeteaseSyncError(error)
			if (isExpiredCookie(error)) await persistCookie('')
			// 网络或存储故障不清空原 Cookie；失效清空仅在数据库提交成功后发布到内存
			throw error
		} finally {
			const manualId = refreshSyncId
			refreshSyncId = null
			refresh = null
			// 刷新失败但凭证未失效时仍同步歌曲，最终提示保留刷新失败的结果
			if (cookie) scheduleRoamingSync(cookie, manualId ? { id: manualId, refreshError } : null)
			else if (manualId) {
				publishNeteaseSync({ id: manualId, phase: 'error', message: refreshError || '网易云登录已失效，请重新扫码' })
			}
		}
	})
	return refresh
}

// 服务关闭前等待在途登录和刷新操作结束
export function waitForSessionUpdates() {
	return pendingUpdate
}
