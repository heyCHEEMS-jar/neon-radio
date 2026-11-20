import type { RadioOptions } from '@neon-radio/protocol'
import { ApiError } from '@/lib/api-error'
import { request } from '@/lib/request'

interface LoginStatus {
	loggedIn: boolean
}

export interface LoginQr {
	key: string
	image: string
}

// 查询当前浏览器是否已经登录管理员会话
export async function fetchLoginStatus(signal?: AbortSignal) {
	const { data } = await request<LoginStatus>('/neon-radio/login', { signal })
	if (!data || typeof data.loggedIn !== 'boolean') throw new ApiError({ key: 'auth.checkFailed' })
	return data.loggedIn
}

export async function logout(signal?: AbortSignal) {
	await request('/neon-radio/login', { method: 'DELETE', signal })
}

// 单项保存电台配置，界面仍以实时广播为准
export async function saveRadioOption(update: { key: keyof RadioOptions; value: RadioOptions[keyof RadioOptions] }, signal?: AbortSignal) {
	await request('/neon-radio/radio-options', {
		signal,
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(update)
	})
}

export async function createLoginQr(signal?: AbortSignal) {
	const { code, data } = await request<LoginQr>('/neon-radio/login-qr', { method: 'POST', signal })
	if (code !== 200 || !data || typeof data.key !== 'string' || typeof data.image !== 'string') throw new ApiError({ key: 'qr.invalidResponse' })
	return data
}

export function checkLoginQr(key: string, signal?: AbortSignal) {
	return request(`/neon-radio/login-qr/${encodeURIComponent(key)}`, { method: 'POST', signal })
}
