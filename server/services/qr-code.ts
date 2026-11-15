import { randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ApiError, isRecord, ncmApi, ncmOptions } from '../utils/ncm.js'
import { saveSessionCookie } from './netease-session.js'
import {
	browserSessionMaxAge,
	hasBrowserSession,
	readBrowserToken,
	revokeBrowserSession,
	setBrowserToken,
	type BrowserSession
} from './browser-session.js'

interface LoginQr {
	key: string
	image: string
}

interface QrStatus {
	code: number
	message: string
	session?: BrowserSession | undefined
}

interface LoginAttempt {
	time: number
	qr: Promise<LoginQr>
	checkedAt: number
	status: QrStatus | null
	poll: Promise<QrStatus> | null
}

const qrThrottleInterval = 5_000
const statusCacheInterval = 2_000
const qrLifetime = 180_000
const attempts = new Map<string, LoginAttempt>()
const generationTimes = new Map<string, number>()
const expiredMessage = '二维码已过期，请重新生成'
const messages: Record<number, string> = {
	800: expiredMessage,
	801: '请用网易云音乐 App 扫码，并在手机上确认。',
	802: '已扫码，请在手机上确认',
	803: '登录成功'
}

// 服务关闭时清理全部二维码和限流缓存
export function clearQrCache() {
	attempts.clear()
	generationTimes.clear()
}

// 识别仍在扫码的临时 token，避免登录检查将它误删
export function hasPendingQr(token: string) {
	const attempt = attempts.get(token)
	return Boolean(attempt && Date.now() - attempt.time < qrLifetime && (!attempt.status || [801, 802].includes(attempt.status.code)))
}

// 作废扫码并等待在途结果，防止退出后被旧请求重新登录
export async function discardQr(token: string) {
	const attempt = attempts.get(token)
	attempts.delete(token)
	const result = attempt?.poll ? await attempt.poll.catch(() => null) : attempt?.status
	if (result?.session) await revokeBrowserSession(result.session.token)
}

// 向网易云申请当前浏览器的二维码
export function createQr(token: string, ip: string): Promise<LoginQr> {
	const now = Date.now()
	for (const [visitor, attempt] of attempts) {
		if (now - attempt.time >= qrLifetime) attempts.delete(visitor)
	}
	for (const [visitor, time] of generationTimes) {
		if (now - time >= qrThrottleInterval) generationTimes.delete(visitor)
	}
	// 只在同一浏览器内复用二维码，IP 仅用于限流
	const cached = attempts.get(token)
	if (cached && now - cached.time < qrThrottleInterval) return cached.qr
	const previousGeneration = generationTimes.get(ip)
	if (previousGeneration !== undefined && now - previousGeneration < qrThrottleInterval) throw new ApiError(429, '二维码生成过于频繁，请稍后重试')
	generationTimes.set(ip, now)

	const qr = (async () => {
		const response = await ncmApi.login_qr_key({ ...ncmOptions, cookie: '' })
		if (response.body.code !== 200) throw response
		const data = response.body.data
		if (!isRecord(data) || typeof data.unikey !== 'string') throw new ApiError(502, '网易云未返回二维码登录 Key')
		const key = data.unikey
		const image = await ncmApi.login_qr_create({ ...ncmOptions, key, qrimg: true, cookie: '' })
		const qrData = image.body.data
		if (!isRecord(qrData) || typeof qrData.qrimg !== 'string') throw new ApiError(502, '二维码生成失败')
		return { key, image: qrData.qrimg }
	})()
	attempts.set(token, { time: now, qr, checkedAt: 0, status: null, poll: null })
	return qr
}

// 查询扫码进度，授权成功后保存网易云凭证并创建本站会话
export async function checkQr(token: string, key: string): Promise<QrStatus> {
	const attempt = attempts.get(token)
	if (!attempt || Date.now() - attempt.time >= qrLifetime || (await attempt.qr).key !== key || attempts.get(token) !== attempt)
		return { code: 800, message: expiredMessage }
	if (attempt.poll) return attempt.poll
	if (attempt.status && ([800, 803].includes(attempt.status.code) || Date.now() - attempt.checkedAt < statusCacheInterval)) return attempt.status

	const poll = (async (): Promise<QrStatus> => {
		const response = await ncmApi.login_qr_check({ ...ncmOptions, key, cookie: '' })
		if (![800, 801, 802, 803].includes(response.body.code)) throw response
		if (attempts.get(token) !== attempt) return { code: 800, message: expiredMessage }
		let session: BrowserSession | undefined
		if (response.body.code === 803) {
			const cookie = (response.cookie || []).map(item => item.split(';')[0]).join('; ')
			session = await saveSessionCookie(cookie, token)
			if (attempts.get(token) !== attempt) {
				await revokeBrowserSession(session.token)
				return { code: 800, message: expiredMessage }
			}
		}
		return { code: response.body.code, message: messages[response.body.code] || '登录状态异常', session }
	})()
	attempt.poll = poll
	try {
		const result = await poll
		attempt.status = result
		attempt.checkedAt = Date.now()
		return result
	} finally {
		attempt.poll = null
	}
}

// 读取或创建扫码标识，将二维码绑定到当前浏览器
export async function createBrowserQr(request: FastifyRequest, reply: FastifyReply) {
	let token = readBrowserToken(request)
	if (!token) {
		token = randomBytes(32).toString('hex')
		// 扫码前只标识浏览器，没有数据库会话记录就不算登录
		setBrowserToken(request, reply, { token, expiresAt: Date.now() + browserSessionMaxAge * 1000 })
	}
	return createQr(token, request.ip)
}

// 扫码成功后写入正式 token，响应中只返回扫码状态
export async function checkBrowserQr(request: FastifyRequest, reply: FastifyReply, key: string) {
	const result = await checkQr(readBrowserToken(request), key)
	if (result.session) {
		if (!(await hasBrowserSession(result.session.token))) return { code: 800, message: '登录已失效，请重新生成二维码' }
		setBrowserToken(request, reply, result.session)
	}
	return { code: result.code, message: result.message }
}
