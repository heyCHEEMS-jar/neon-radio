import type { FastifyReply, FastifyRequest, onSendAsyncHookHandler } from 'fastify'
import { getSessionStatus, hasBrowserSession, hasPendingQr } from '../modules/session/index.js'
import { clearBrowserToken, readRequestToken } from '../platform/http/cookie.js'
import { normalizeRequestPath } from '../platform/http/path.js'

const publicPaths = new Set([
	'/neon-radio/login',
	'/neon-radio/login-qr',
	'/neon-radio/ncm/login/qr/key',
	'/neon-radio/ncm/login/qr/create',
	'/neon-radio/ncm/login/qr/check'
])

// 业务接口要求管理员会话；扫码与音源取链保持公开
export default async function browserAuth(request: FastifyRequest, reply: FastifyReply) {
	const path = normalizeRequestPath(request.url)
	if (!path) return reply.code(400).send({ code: 400, message: '请求路径不合法' })
	// 音源和歌词目录只公开 GET，具体歌曲由业务服务校验
	const publicAudio =
		request.method === 'GET' && (path.startsWith('/neon-radio/radio-audio/') || path.startsWith('/neon-radio/radio-lyric/'))
	if (!path.startsWith('/neon-radio/') || publicPaths.has(path) || path.startsWith('/neon-radio/login-qr/') || publicAudio) return

	reply.header('Cache-Control', 'private, no-store')
	try {
		if (getSessionStatus().loggedIn && (await hasBrowserSession(readRequestToken(request)))) return
	} catch {
		return reply.code(503).send({ code: 503, message: '登录状态检查失败，请重试' })
	}
	return reply.code(401).send({ code: 401, message: '请先扫码登录电台' })
}

// 鉴权失败时清除失效 Cookie，保留仍在扫码的临时标识
export const clearExpiredBrowserToken: onSendAsyncHookHandler = async (request, reply, payload) => {
	if (reply.statusCode !== 401) return payload
	const token = readRequestToken(request)
	if (token && !hasPendingQr(token)) clearBrowserToken(reply)
	return payload
}
