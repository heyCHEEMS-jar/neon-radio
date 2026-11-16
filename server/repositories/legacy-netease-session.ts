import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { isNeteaseCookie } from '../utils/cookie.js'
import { formatUtcTimestamp } from '../utils/date.js'
import { isRecord } from '../utils/object.js'

interface LegacySession {
	cookie: string
	updatedAt: string
}

const cookieFile = path.resolve('.data/netease-session.json')
const cookieTempFile = `${cookieFile}.tmp`

async function removeLegacyFile(file: string) {
	try {
		await unlink(file)
	} catch (error: unknown) {
		if (isRecord(error) && error.code === 'ENOENT') return
		throw new Error('清理旧版网易云登录态文件失败，请检查 .data 目录权限')
	}
}

export async function removeLegacyNeteaseFiles() {
	await Promise.all([removeLegacyFile(cookieFile), removeLegacyFile(cookieTempFile)])
}

export function removeLegacyNeteaseTempFile() {
	return removeLegacyFile(cookieTempFile)
}

// 只读取 UID 匹配的旧凭证，迁移提交前不删除源文件
export async function readLegacyNeteaseSession(uid: string): Promise<LegacySession | null> {
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
	if (saved.uid !== uid) throw new Error('旧版网易云登录态 UID 与 NETEASE_UID 不一致，请检查配置或移走旧文件')
	if (typeof saved.cookie !== 'string' || !isNeteaseCookie(saved.cookie, true)) throw new Error('旧版网易云登录态 Cookie 格式无效')
	if (typeof saved.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(saved.updatedAt)) {
		throw new Error('旧版网易云登录态的 updatedAt 格式无效')
	}
	const updatedAt = new Date(saved.updatedAt)
	if (Number.isNaN(updatedAt.getTime()) || updatedAt.toISOString() !== saved.updatedAt) {
		throw new Error('旧版网易云登录态的 updatedAt 格式无效')
	}
	return { cookie: saved.cookie, updatedAt: formatUtcTimestamp(updatedAt) }
}
