import { randomUUID } from 'node:crypto'
import config, { validateConfig } from '../../config.js'
import { decryptCookie, decodeKey, encryptCookie } from '../../platform/crypto.js'
import type { ServerMessage } from '@neon-radio/protocol'
import { AppError, UpstreamError } from '../../platform/errors.js'
import { readNeteaseAccount, refreshNeteaseCookie } from '../../platform/netease/auth.js'
import { isNeteaseCookie } from '../../platform/netease/cookie.js'
import { formatUtcTimestamp } from '../../platform/time.js'
import { isRoamingSyncing, publishRoamingSongs, scheduleRoamingSync } from '../roaming/index.js'
import { createBrowserSession, revokeBrowserSessions } from './browser-session.js'
import { findNeteaseSessionRow, saveNeteaseSessionRow } from './store.js'
import { getNeteaseSyncState, publishNeteaseSync, readNeteaseSyncError } from '../sync-state.js'

let cookie = ''
let updatedAt: string | null = null
let encryptionKey: Buffer | null = null
let pendingUpdate = Promise.resolve()
let verifiedUntil = 0
let verification: Promise<boolean> | null = null
let refresh: Promise<void> | null = null
let refreshSyncId: string | null = null
let nextManualSyncAt = 0

// 串行更新网易云凭证，避免登录、刷新和失效清理互相覆盖
function updateSession<T>(update: () => Promise<T>) {
	const next = pendingUpdate.then(update)
	pendingUpdate = next.then(
		() => {},
		() => {}
	)
	return next
}

// 清空网易云凭证时先撤销本站会话，存储成功后再发布内存状态
async function persistCookie(value: string) {
	if (!encryptionKey) throw new Error('网易云登录态尚未初始化')
	// 避免网易云重新登录后旧 token 自动恢复有效
	if (!value) await revokeBrowserSessions()
	const savedAt = new Date()
	await saveNeteaseSessionRow(config.NETEASE_UID, encryptCookie(value, config.NETEASE_UID, encryptionKey), savedAt)
	cookie = value
	updatedAt = formatUtcTimestamp(savedAt)
	verifiedUntil = 0
}

// 校验凭证和固定账号，原始接口响应由适配层处理
async function validateCookie(value: string) {
	if (!isNeteaseCookie(value)) throw new AppError(401, { key: 'session.cookieInvalid' })
	const account = await readNeteaseAccount(value)
	if (account.uid !== config.NETEASE_UID) throw new AppError(403, { key: 'session.uidMismatch' })
	if (!isNeteaseCookie(account.cookie)) throw new AppError(401, { key: 'session.expired' })
	return account.cookie
}

// 初始化存储并恢复服务端保存的网易云登录
export async function initSession() {
	validateConfig()
	const key = decodeKey(config.NETEASE_COOKIE_ENCRYPTION_KEY)
	const stored = await findNeteaseSessionRow(config.NETEASE_UID)
	encryptionKey = key
	if (stored) {
		const restored = decryptCookie(stored.cookieEnvelope, config.NETEASE_UID, key)
		if (!isNeteaseCookie(restored, true)) throw new Error('数据库中的网易云登录态 Cookie 格式异常')
		cookie = restored
		updatedAt = formatUtcTimestamp(stored.updatedAt)
	} else {
		cookie = ''
		updatedAt = null
	}
	verifiedUntil = 0
	if (!cookie) await revokeBrowserSessions()
}

// 返回电台账号的登录概况，不代表当前浏览器已经登录
export function getSessionStatus() {
	return { uid: config.NETEASE_UID, loggedIn: Boolean(cookie), updatedAt }
}

// 读取服务端网易云凭证，未登录时拒绝请求
export function getSessionCookie() {
	if (!cookie) throw new AppError(401, { key: 'session.loginFirst' })
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
	return error instanceof UpstreamError && (error.kind === 'expired' || error.kind === 'forbidden')
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
export async function withSessionCookie<T>(request: (value: string) => Promise<T>) {
	const current = getSessionCookie()
	try {
		return await request(current)
	} catch (error: unknown) {
		if (error instanceof UpstreamError && error.kind === 'expired') {
			await updateSession(async () => {
				if (cookie === current) await persistCookie('')
			})
		}
		throw error
	}
}

// 手动同步全局节流 30 秒，失败后允许立即重试，在途任务继续复用
export function startNeteaseSync() {
	getSessionCookie()
	if (isRoamingSyncing()) throw new AppError(429, { key: 'sync.busy' })
	const current = getNeteaseSyncState()
	const now = Date.now()
	const remainingMs = nextManualSyncAt - now
	if (remainingMs > 0 && current?.phase !== 'error') {
		throw new AppError(429, { key: 'sync.tooFrequent', params: { seconds: Math.ceil(remainingMs / 1000) } })
	}
	nextManualSyncAt = now + 30_000
	if (current?.phase === 'refreshing' || current?.phase === 'syncing') throw new AppError(429, { key: 'sync.busy' })
	const state = publishNeteaseSync({ id: randomUUID(), phase: 'refreshing', message: { key: 'sync.refreshing' } })
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
		let refreshError: ServerMessage | null = null
		try {
			if (!cookie) {
				refreshError = { key: 'upstream.expired' }
				return
			}
			const refreshedCookie = await refreshNeteaseCookie(cookie)
			await persistCookie(await validateCookie(refreshedCookie))
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
			if (cookie) {
				const scheduled = scheduleRoamingSync(cookie, manualId ? { id: manualId, refreshError, refreshDetails: true } : null)
				if (!scheduled && manualId) {
					publishNeteaseSync({
						id: manualId,
						phase: 'error',
						message: refreshError
							? { key: 'sync.pendingAfterRefreshFailed', params: { error: refreshError } }
							: { key: 'sync.pending' }
					})
				}
			} else if (manualId)
				publishNeteaseSync({ id: manualId, phase: 'error', message: refreshError ?? { key: 'upstream.expired' } })
		}
	})
	return refresh
}

// 服务关闭前等待在途登录和刷新操作结束
export function waitForSessionUpdates() {
	return pendingUpdate
}
