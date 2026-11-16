import { ApiError } from '../../utils/api-error.js'
import { mergeCookies } from '../../utils/cookie.js'
import { isRecord } from '../../utils/object.js'
import { ncmApi, ncmOptions } from './client.js'

export interface LoginQr {
	key: string
	image: string
}

export async function readNeteaseAccount(cookie: string) {
	const response = await ncmApi.login_status({ ...ncmOptions, cookie })
	const data = response.body.data
	if (!isRecord(data) || data.code !== 200) throw response
	const account = isRecord(data.account) ? data.account : undefined
	if (typeof account?.id !== 'number' && typeof account?.id !== 'string') throw new ApiError(401, '网易云账号尚未登录')
	return { uid: String(account.id), cookie: mergeCookies(cookie, response.cookie || []) }
}

export async function refreshNeteaseCookie(cookie: string) {
	const response = await ncmApi.login_refresh({ ...ncmOptions, cookie })
	if (response.body.code !== 200) throw response
	return mergeCookies(cookie, response.cookie || [])
}

// 二维码 Key 与图片依次生成，统一校验上游响应结构
export async function createLoginQr(): Promise<LoginQr> {
	const response = await ncmApi.login_qr_key({ ...ncmOptions, cookie: '' })
	if (response.body.code !== 200) throw response
	const data = response.body.data
	if (!isRecord(data) || typeof data.unikey !== 'string') throw new ApiError(502, '网易云未返回二维码登录 Key')
	const key = data.unikey
	const image = await ncmApi.login_qr_create({ ...ncmOptions, key, qrimg: true, cookie: '' })
	const qrData = image.body.data
	if (!isRecord(qrData) || typeof qrData.qrimg !== 'string') throw new ApiError(502, '二维码生成失败')
	return { key, image: qrData.qrimg }
}

export async function readLoginQrStatus(key: string) {
	const response = await ncmApi.login_qr_check({ ...ncmOptions, key, cookie: '' })
	if (![800, 801, 802, 803].includes(response.body.code)) throw response
	return { code: response.body.code, cookie: (response.cookie || []).map(item => item.split(';')[0]).join('; ') }
}
