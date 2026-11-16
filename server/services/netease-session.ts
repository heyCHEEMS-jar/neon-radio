import { randomUUID } from 'node:crypto'
import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import config, { validateConfig } from '../config.js'
import { mergeCookies } from '../utils/cookie.js'
import { decodeNeteaseSessionKey, decryptNeteaseSessionCookie, encryptNeteaseSessionCookie } from '../utils/netease-session-crypto.js'
import { ApiError, isRecord, ncmApi, ncmOptions } from '../utils/ncm.js'
import { findNeteaseSession, initNeteaseSessionRepository, upsertNeteaseSession } from './netease-session-repository.js'
import { createBrowserSession, initBrowserSessions, revokeBrowserSessions } from './browser-session.js'
import { getNeteaseSyncState, publishNeteaseSync, readNeteaseSyncError } from './netease-sync-state.js'
import { scheduleRoamingSync } from './roaming-sync.js'

const cookieFile = path.resolve('.data/netease-session.json')
const cookieTempFile = `${cookieFile}.tmp`
const musicUCookiePattern = /(?:^|;\s*)MUSIC_U=[^;]+/
const legacyUpdatedAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const updatedAtPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

let cookie = ''
let updatedAt: string | null = null
let encryptionKey: Buffer | null = null
let pendingUpdate = Promise.resolve()
let verifiedUntil = 0
let verification: Promise<boolean> | null = null
let refresh: Promise<void> | null = null
let refreshSyncId: string | null = null

interface LegacySession {
	cookie: string
	updatedAt: string
}

function formatUpdatedAt(value: Date) {
	return value
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d{3}Z$/, '')
}

function hasValidCookieStructure(value: string, allowEmpty = false) {
	return value.length <= 16_384 && !/[\r\n]/.test(value) && ((allowEmpty && !value) || musicUCookiePattern.test(value))
}

function validateDatabaseUpdatedAt(value: unknown) {
	if (typeof value !== 'string' || !updatedAtPattern.test(value)) throw new Error('数据库中的网易云登录态时间格式异常')
	const parsed = new Date(`${value.replace(' ', 'T')}Z`)
	if (Number.isNaN(parsed.getTime()) || formatUpdatedAt(parsed) !== value) throw new Error('数据库中的网易云登录态时间格式异常')
	return value
}

function normalizeLegacyUpdatedAt(value: unknown) {
	if (typeof value !== 'string' || !legacyUpdatedAtPattern.test(value)) throw new Error('旧版网易云登录态的 updatedAt 格式无效')
	const parsed = new Date(value)
	if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new Error('旧版网易云登录态的 updatedAt 格式无效')
	return formatUpdatedAt(parsed)
}

// 串行更新网易云凭证，避免登录、刷新和失效清理互相覆盖
function updateSession<T>(update: () => Promise<T>) {
	const next = pendingUpdate.then(update)
	pendingUpdate = next.then(
		() => {},
		() => {}
	)
	return next
}

async function removeLegacyFile(file: string) {
	try {
		await unlink(file)
	} catch (error: unknown) {
		if (isRecord(error) && error.code === 'ENOENT') return
		throw new Error('清理旧版网易云登录态文件失败，请检查 .data 目录权限')
	}
}

async function removeLegacyFiles() {
	await removeLegacyFile(cookieFile)
	await removeLegacyFile(cookieTempFile)
}

async function readLegacySession(): Promise<LegacySession | null> {
	let source: string
	try {
		source = await readFile(cookieFile, 'utf8')
	} catch (error: unknown) {
		if (isRecord(error) && error.code === 'ENOENT') return null
		throw new Error('读取旧版网易云登录态失败，请检查 .data/netease-session.json')
	}

	let saved: unknown
	try {
		saved = JSON.parse(source)
	} catch {
		throw new Error('旧版网易云登录态文件已损坏，请修复或移走 .data/netease-session.json')
	}
	if (!isRecord(saved)) throw new Error('旧版网易云登录态文件格式无效')
	if (saved.uid !== config.NETEASE_UID) throw new Error('旧版网易云登录态 UID 与 NETEASE_UID 不一致，请检查配置或移走旧文件')
	if (typeof saved.cookie !== 'string' || !hasValidCookieStructure(saved.cookie, true)) {
		throw new Error('旧版网易云登录态 Cookie 格式无效')
	}
	return { cookie: saved.cookie, updatedAt: normalizeLegacyUpdatedAt(saved.updatedAt) }
}

// 加密持久化网易云 Cookie，清空时一并撤销本站会话
async function persistCookie(value: string) {
	if (!encryptionKey) throw new Error('网易云登录态尚未初始化')
	const savedAt = formatUpdatedAt(new Date())
	const envelope = encryptNeteaseSessionCookie(value, config.NETEASE_UID, encryptionKey)
	// 先撤销浏览器会话，避免网易云重新登录后旧 token 自动恢复有效
	if (!value) await revokeBrowserSessions()
	await upsertNeteaseSession(config.NETEASE_UID, envelope, savedAt)
	cookie = value
	updatedAt = savedAt
	verifiedUntil = 0
}

// 核实网易云 Cookie，并校验账号是否为配置的固定 UID
async function validateCookie(value: string) {
	if (!hasValidCookieStructure(value)) throw new ApiError(401, '网易云登录 Cookie 无效')
	const response = await ncmApi.login_status({ ...ncmOptions, cookie: value })
	const data = response.body.data
	if (!isRecord(data) || data.code !== 200) throw response
	const account = isRecord(data.account) ? data.account : undefined
	if (typeof account?.id !== 'number' && typeof account?.id !== 'string') throw new ApiError(401, '网易云账号尚未登录')
	if (String(account.id) !== config.NETEASE_UID) throw new ApiError(403, '扫码账号与电台 UID 不匹配，原登录态未更改')
	const merged = mergeCookies(value, response.cookie || [])
	if (!hasValidCookieStructure(merged)) throw new ApiError(401, '网易云登录已失效')
	return merged
}

// 初始化存储并恢复服务端保存的网易云登录
export async function initSession() {
	validateConfig()
	const key = decodeNeteaseSessionKey(config.NETEASE_COOKIE_ENCRYPTION_KEY)
	await initNeteaseSessionRepository()
	await initBrowserSessions()
	const stored = await findNeteaseSession(config.NETEASE_UID)

	let restoredCookie = ''
	let restoredUpdatedAt: string | null = null
	if (stored) {
		if (!Buffer.isBuffer(stored.cookieEnvelope)) throw new Error('数据库中的网易云登录态密文格式异常')
		restoredCookie = decryptNeteaseSessionCookie(stored.cookieEnvelope, config.NETEASE_UID, key)
		if (!hasValidCookieStructure(restoredCookie, true)) throw new Error('数据库中的网易云登录态 Cookie 格式异常')
		restoredUpdatedAt = validateDatabaseUpdatedAt(stored.updatedAt)
		await removeLegacyFiles()
	} else {
		const legacy = await readLegacySession()
		if (legacy) {
			const envelope = encryptNeteaseSessionCookie(legacy.cookie, config.NETEASE_UID, key)
			await upsertNeteaseSession(config.NETEASE_UID, envelope, legacy.updatedAt)
			await removeLegacyFiles()
			restoredCookie = legacy.cookie
			restoredUpdatedAt = legacy.updatedAt
		} else {
			await removeLegacyFile(cookieTempFile)
		}
	}

	encryptionKey = key
	cookie = restoredCookie
	updatedAt = restoredUpdatedAt
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
		await persistCookie(await validateCookie(value.trim()))
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
		let refreshError: string | null = null
		try {
			if (!cookie) {
				refreshError = '网易云登录已失效，请重新扫码'
				return
			}
			const response = await ncmApi.login_refresh({ ...ncmOptions, cookie })
			if (response.body.code !== 200) throw response
			await persistCookie(await validateCookie(mergeCookies(cookie, response.cookie || [])))
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
