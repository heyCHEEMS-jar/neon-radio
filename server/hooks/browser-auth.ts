import type { FastifyReply, FastifyRequest, onSendAsyncHookHandler } from 'fastify'
import { readBrowserToken, setBrowserToken } from '../http/browser-token.js'
import { hasBrowserSession } from '../services/session/browser-session.js'
import { getSessionStatus } from '../services/session/netease-session.js'
import { hasPendingQr } from '../services/session/qr-code.js'
import { normalizeRequestPath } from '../utils/request-path.js'

const publicPaths = new Set([
	'/neon-radio/login',
	'/neon-radio/login-qr',
	'/neon-radio/ncm/login/qr/key',
	'/neon-radio/ncm/login/qr/create',
	'/neon-radio/ncm/login/qr/check'
])

export default async function browserAuth(request: FastifyRequest, reply: FastifyReply) {
	let path: string
	try {
		path = normalizeRequestPath(request.url)
	} catch {
		return reply.code(400).send({ code: 400, message: '请求路径不合法' })
	}
	// 音源目录只公开 GET，具体歌曲由业务服务校验
	const publicAudio = request.method === 'GET' && path.startsWith('/neon-radio/radio-audio/')
	if (!path.startsWith('/neon-radio/') || publicPaths.has(path) || path.startsWith('/neon-radio/login-qr/') || publicAudio) return

	reply.header('Cache-Control', 'private, no-store')
	try {
		if (getSessionStatus().loggedIn && (await hasBrowserSession(readBrowserToken(request)))) return
	} catch {
		return reply.code(503).send({ code: 503, message: '登录状态检查失败，请重试' })
	}
	return reply.code(401).send({ code: 401, message: '请先扫码登录电台' })
}

// 鉴权失败时清除失效 Cookie，保留仍在扫码的临时标识
export const clearExpiredBrowserToken: onSendAsyncHookHandler = async (request, reply, payload) => {
	if (reply.statusCode !== 401) return payload
	const token = readBrowserToken(request)
	if (token && !hasPendingQr(token)) setBrowserToken(request, reply)
	return payload
}
