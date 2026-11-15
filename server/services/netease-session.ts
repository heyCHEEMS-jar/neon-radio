import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import config, { validateConfig } from '../config.js'
import { mergeCookies } from '../utils/cookie.js'
import { decodeNeteaseSessionKey, decryptNeteaseSessionCookie, encryptNeteaseSessionCookie } from '../utils/netease-session-crypto.js'
import { ApiError, isRecord, ncmApi, ncmOptions } from '../utils/ncm.js'
import { findNeteaseSession, initNeteaseSessionRepository, upsertNeteaseSession } from './netease-session-repository.js'

const cookieFile = path.resolve('.data/netease-session.json')
const cookieTempFile = `${cookieFile}.tmp`
const musicUCookiePattern = /(?:^|;\s*)MUSIC_U=[^;]+/
const legacyUpdatedAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const updatedAtPattern = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

let cookie = ''
let updatedAt: string | null = null
let encryptionKey: Buffer | null = null
let pendingUpdate = Promise.resolve()

interface LegacySession {
	cookie: string
	updatedAt: string
}

function formatUpdatedAt(value: Date) {
	return value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
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

function updateSession(update: () => Promise<void>) {
	const next = pendingUpdate.then(update)
	pendingUpdate = next.catch(() => {})
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

async function persistCookie(value: string) {
	if (!encryptionKey) throw new Error('网易云登录态尚未初始化')
	const savedAt = formatUpdatedAt(new Date())
	const envelope = encryptNeteaseSessionCookie(value, config.NETEASE_UID, encryptionKey)
	await upsertNeteaseSession(config.NETEASE_UID, envelope, savedAt)
	cookie = value
	updatedAt = savedAt
}

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

export async function initSession() {
	validateConfig()
	const key = decodeNeteaseSessionKey(config.NETEASE_COOKIE_ENCRYPTION_KEY)
	await initNeteaseSessionRepository()
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
}

export function getSessionStatus() {
	return { uid: config.NETEASE_UID, loggedIn: Boolean(cookie), needsLogin: !cookie, updatedAt }
}

export function getSessionCookie() {
	if (!cookie) throw new ApiError(401, '请打开登录弹窗扫码登录电台账号')
	return cookie
}

export function saveSessionCookie(value: string) {
	return updateSession(async () => persistCookie(await validateCookie(value.trim())))
}

export function refreshSession() {
	return updateSession(async () => {
		if (!cookie) return
		try {
			const response = await ncmApi.login_refresh({ ...ncmOptions, cookie })
			if (response.body.code !== 200) throw response
			await persistCookie(await validateCookie(mergeCookies(cookie, response.cookie || [])))
		} catch (error: unknown) {
			const body = isRecord(error) && isRecord(error.body) ? error.body : undefined
			const expired = typeof body?.code === 'number' && [301, 401, 403].includes(body.code)
			if (expired || (error instanceof ApiError && [401, 403].includes(error.statusCode))) await persistCookie('')
			// 网络或存储故障不清空原 Cookie；失效清空仅在数据库提交成功后发布到内存。
			throw error
		}
	})
}

export function waitForSessionUpdates() {
	return pendingUpdate
}
