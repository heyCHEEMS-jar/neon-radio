import type { LoginQr } from '../../platform/netease/auth.js'
import { createLoginQr, readLoginQrStatus } from '../../platform/netease/auth.js'
import { AppError } from '../../platform/errors.js'
import { revokeBrowserSession, type BrowserSession } from './browser-session.js'
import { saveSessionCookie } from './service.js'

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

const qrReuseInterval = 5_000
const statusCacheInterval = 2_000
const qrLifetime = 180_000
const attempts = new Map<string, LoginAttempt>()
const expiredMessage = '二维码已过期，请重新生成'
const messages: Record<number, string> = {
	800: expiredMessage,
	801: '请用网易云音乐 App 扫码，并在手机上确认。',
	802: '已扫码，请在手机上确认',
	803: '登录成功'
}

// 服务关闭时清理全部二维码轮询状态
export function clearQrCache() {
	attempts.clear()
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

// 同一浏览器 5 秒内复用二维码，请求频率由 HTTP 限流负责
export function createQr(token: string): Promise<LoginQr> {
	const now = Date.now()
	for (const [visitor, attempt] of attempts) {
		if (now - attempt.time >= qrLifetime) attempts.delete(visitor)
	}
	const cached = attempts.get(token)
	if (cached && now - cached.time < qrReuseInterval) return cached.qr

	const qr = createLoginQr()
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
		const status = await readLoginQrStatus(key)
		if (attempts.get(token) !== attempt) return { code: 800, message: expiredMessage }
		let session: BrowserSession | undefined
		if (status.code === 803) {
			session = await saveSessionCookie(status.cookie, token)
			if (attempts.get(token) !== attempt) {
				await revokeBrowserSession(session.token)
				return { code: 800, message: expiredMessage }
			}
		}
		return { code: status.code, message: messages[status.code] || '登录状态异常', session }
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

// 二维码请求过于密集时给出明确提示，避免重复打上游接口
export function assertQrAvailable(token: string) {
	if (hasPendingQr(token)) return
	const attempt = attempts.get(token)
	if (attempt && Date.now() - attempt.time < qrReuseInterval) throw new AppError(429, '二维码生成过于频繁，请稍后重试')
}
