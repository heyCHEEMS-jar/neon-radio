import { createLoginQr, readLoginQrStatus, type LoginQr } from '../../integrations/netease/auth.js'
import { ApiError } from '../../utils/api-error.js'
import { revokeBrowserSession, type BrowserSession } from './browser-session.js'
import { saveSessionCookie } from './netease-session.js'

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
