import { parseCookie } from 'cookie'
import { parse as parseSetCookie } from 'set-cookie-parser'

// 合并网易云 Set-Cookie，同时识别 Max-Age=0 和过期时间两种注销方式
export function mergeCookies(current: string, updates: string[]) {
	const cookies = new Map(Object.entries(parseCookie(current)))
	for (const item of parseSetCookie(updates, { decodeValues: false })) {
		const expired = (typeof item.maxAge === 'number' && item.maxAge <= 0) || (item.expires !== undefined && item.expires.getTime() <= Date.now())
		if (!item.value || expired) cookies.delete(item.name)
		else cookies.set(item.name, item.value)
	}
	return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
}

// 只接受带 MUSIC_U 的 Cookie，长度和换行用于防止头部注入
export function isNeteaseCookie(value: string, allowEmpty = false) {
	return value.length <= 16_384 && !/[\r\n]/.test(value) && ((allowEmpty && !value) || /(?:^|;\s*)MUSIC_U=[^;]+/.test(value))
}
