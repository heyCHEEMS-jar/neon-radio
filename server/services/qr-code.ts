import { ApiError, isRecord, ncmApi, ncmOptions } from '../utils/ncm.js'
import { saveSessionCookie } from './netease-session.js'

interface LoginQr {
	key: string
	image: string
}

interface QrStatus {
	code: number
	message: string
}

const qrThrottleInterval = 5_000
const statusCacheInterval = 2_000
const qrCache = new Map<string, { time: number; result: Promise<LoginQr> }>()
const statusCache = new Map<string, { key: string; time: number; result: Promise<QrStatus> }>()
const messages: Record<number, string> = {
	800: '二维码已过期',
	801: '请用网易云音乐 App 扫码，并在手机上确认。',
	802: '已扫码，请在手机上确认',
	803: '登录成功'
}

export function clearQrCache() {
	qrCache.clear()
	statusCache.clear()
}

export function createQr(ip: string): Promise<LoginQr> {
	const now = Date.now()
	for (const [visitor, cached] of qrCache) {
		if (now - cached.time >= 180_000) {
			qrCache.delete(visitor)
			statusCache.delete(visitor)
		}
	}
	// 命中不延长节流窗口，5秒内复用上次结果
	const cached = qrCache.get(ip)
	if (cached && now - cached.time < qrThrottleInterval) return cached.result

	const result = (async () => {
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
	qrCache.set(ip, { time: now, result })
	statusCache.delete(ip)
	return result
}

export async function checkQr(ip: string, key: string): Promise<QrStatus> {
	const qr = qrCache.get(ip)
	if (!qr || Date.now() - qr.time >= 180_000 || (await qr.result).key !== key) {
		return { code: 800, message: '二维码已过期，请重新生成' }
	}
	const cached = statusCache.get(ip)
	if (cached?.key === key && Date.now() - cached.time < statusCacheInterval) return cached.result

	const result = (async () => {
		const response = await ncmApi.login_qr_check({ ...ncmOptions, key, cookie: '' })
		if (![800, 801, 802, 803].includes(response.body.code)) throw response
		if (response.body.code === 803) {
			const cookie = (response.cookie || []).map(item => item.split(';')[0]).join('; ')
			await saveSessionCookie(cookie)
		}
		return { code: response.body.code, message: messages[response.body.code] || '登录状态异常' }
	})()
	statusCache.set(ip, { key, time: Date.now(), result })
	return result
}
