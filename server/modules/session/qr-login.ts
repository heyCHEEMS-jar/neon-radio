import { randomBytes } from 'node:crypto'
import { browserSessionMaxAge, hasBrowserSession } from './browser-session.js'
import { checkQr, createQr } from './qr.js'

// 首次扫码只下发临时标识，未入库的 token 不算登录
export function startBrowserQr(token: string) {
	const browserToken = token || randomBytes(32).toString('hex')
	return {
		browserToken,
		isNewToken: !token,
		expiresAt: Date.now() + browserSessionMaxAge * 1000,
		qr: createQr(browserToken)
	}
}

// 扫码成功返回正式会话，由入口层写入 HttpOnly Cookie
export async function checkBrowserQr(token: string, key: string) {
	const result = await checkQr(token, key)
	if (result.session && !(await hasBrowserSession(result.session.token))) return { code: 800, message: '登录已失效，请重新生成二维码' }
	return result
}
