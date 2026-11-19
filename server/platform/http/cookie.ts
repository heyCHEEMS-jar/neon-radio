import { parseCookie } from 'cookie'
import type { FastifyReply, FastifyRequest } from 'fastify'

const cookiePath = '/neon-radio'
const tokenPattern = /^[a-f0-9]{64}$/

// 从原始 Header 读取浏览器 token，WS 握手与 HTTP 共用
export function readTokenCookie(header: string | undefined) {
	const value = header ? parseCookie(header).token : undefined
	return value && tokenPattern.test(value) ? value : ''
}

export interface BrowserToken {
	token: string
	expiresAt: number
}

// 读取 @fastify/cookie 解析后的 token，格式不符按未登录处理
export function readRequestToken(request: FastifyRequest) {
	const value = request.cookies.token
	return value && tokenPattern.test(value) ? value : ''
}

// 写入 HttpOnly token；生产环境总是加 Secure
export function setBrowserToken(request: FastifyRequest, reply: FastifyReply, session: BrowserToken) {
	const secure = request.protocol === 'https' || process.env.NODE_ENV === 'production'
	reply.setCookie('token', session.token, {
		path: cookiePath,
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000))
	})
}

export function clearBrowserToken(reply: FastifyReply) {
	reply.clearCookie('token', { path: cookiePath })
}
