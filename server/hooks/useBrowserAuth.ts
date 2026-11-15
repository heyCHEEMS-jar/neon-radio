import type { FastifyReply, FastifyRequest } from 'fastify'
import { getSessionStatus } from '../services/netease-session.js'
import { hasBrowserSession, readBrowserToken } from '../services/browser-session.js'

const publicPaths = new Set([
	'/neon-radio/login',
	'/neon-radio/login-qr',
	'/neon-radio/ncm/login/qr/key',
	'/neon-radio/ncm/login/qr/create',
	'/neon-radio/ncm/login/qr/check'
])

export default async function useBrowserAuth(request: FastifyRequest, reply: FastifyReply) {
	let path: string
	try {
		path = decodeURIComponent(request.url.split('?')[0] || '')
			.replace(/\/+$/, '')
			.toLowerCase()
	} catch {
		return reply.code(400).send({ code: 400, message: '请求路径不合法' })
	}
	if (!path.startsWith('/neon-radio/') || publicPaths.has(path) || path.startsWith('/neon-radio/login-qr/')) return

	reply.header('Cache-Control', 'private, no-store')
	try {
		if (getSessionStatus().loggedIn && (await hasBrowserSession(readBrowserToken(request)))) return
	} catch {
		return reply.code(503).send({ code: 503, message: '登录状态检查失败，请重试' })
	}
	return reply.code(401).send({ code: 401, message: '请先扫码登录电台' })
}
