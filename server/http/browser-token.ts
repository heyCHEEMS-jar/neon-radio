import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BrowserSession } from '../services/session/browser-session.js'

// 读取 token Cookie，仅检查格式，不验证登录
export function readBrowserToken(request: { headers: { cookie?: string | undefined } }) {
	const value = request.headers.cookie
		?.split(';')
		.map(item => item.trim())
		.find(item => item.startsWith('token='))
		?.slice(6)
	return value && /^[a-f0-9]{64}$/.test(value) ? value : ''
}

// 写入 HttpOnly token；未传会话时清除 Cookie
export function setBrowserToken(request: FastifyRequest, reply: FastifyReply, session?: BrowserSession) {
	const secure = request.protocol === 'https' || process.env.NODE_ENV === 'production'
	const maxAge = session ? Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)) : 0
	reply.header('Set-Cookie', `token=${session?.token || ''}; Path=/neon-radio; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
}
