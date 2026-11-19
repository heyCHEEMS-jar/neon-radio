import { isRecord } from '@neon-radio/protocol'
import { UpstreamError } from '../errors.js'
import { ncmApi, ncmOptions, requireOk, upstreamError } from './client.js'
import { mergeCookies } from './cookie.js'

export interface LoginQr {
	key: string
	image: string
}

// 校验 Cookie 对应的网易云账号，返回合并后的最新 Cookie
export async function readNeteaseAccount(cookie: string) {
	const response = await ncmApi.login_status({ ...ncmOptions, cookie })
	// login_status 的错误码在 body.data.code，而不是 body.code
	const data = isRecord(response.body.data) ? response.body.data : undefined
	if (!data || data.code !== 200) throw upstreamError(response, '网易云账号状态请求失败')
	const account = isRecord(data.account) ? data.account : undefined
	const id = account?.id
	if (typeof id !== 'number' && typeof id !== 'string') throw new UpstreamError('expired', '网易云账号尚未登录')
	return { uid: String(id), cookie: mergeCookies(cookie, response.cookie || []) }
}

export async function refreshNeteaseCookie(cookie: string) {
	const response = requireOk(await ncmApi.login_refresh({ ...ncmOptions, cookie }), '网易云登录刷新失败')
	return mergeCookies(cookie, response.cookie || [])
}

// 二维码 Key 与图片依次生成，统一校验上游响应结构
export async function createLoginQr(): Promise<LoginQr> {
	const keyResponse = requireOk(await ncmApi.login_qr_key({ ...ncmOptions, cookie: '' }), '网易云未返回二维码登录 Key')
	const keyData = keyResponse.body.data
	if (!isRecord(keyData) || typeof keyData.unikey !== 'string') throw new UpstreamError('unavailable', '网易云未返回二维码登录 Key')

	const imageResponse = requireOk(await ncmApi.login_qr_create({ ...ncmOptions, key: keyData.unikey, qrimg: true, cookie: '' }), '二维码生成失败')
	const imageData = imageResponse.body.data
	if (!isRecord(imageData) || typeof imageData.qrimg !== 'string') throw new UpstreamError('unavailable', '二维码生成失败')
	return { key: keyData.unikey, image: imageData.qrimg }
}

// 800-803 是扫码状态而非错误，其余响应交给统一错误映射
export async function readLoginQrStatus(key: string) {
	const response = await ncmApi.login_qr_check({ ...ncmOptions, key, cookie: '' })
	if (![800, 801, 802, 803].includes(response.body.code)) throw upstreamError(response, '扫码接口请求失败')
	return { code: response.body.code, cookie: (response.cookie || []).map(item => item.split(';')[0]).join('; ') }
}
