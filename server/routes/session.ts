import type { FastifyInstance } from 'fastify'
import { readBrowserToken, setBrowserToken } from '../http/browser-token.js'
import { checkBrowserQr, createBrowserQr } from '../http/qr-code.js'
import { hasBrowserSession, revokeBrowserSession } from '../services/session/browser-session.js'
import { getSessionStatus, saveSessionCookie, verifySession } from '../services/session/netease-session.js'
import { discardQr, hasPendingQr } from '../services/session/qr-code.js'

// 注册登录状态、扫码和退出接口
export default async function sessionRoutes(fastify: FastifyInstance) {
	const checks = new Map<string, number>()
	let resetAt = 0
	fastify.addHook('onClose', async () => checks.clear())

	fastify.get('/login', async (request, reply) => {
		// 每个固定分钟窗口内，每 IP 最多检查 60 次
		if (Date.now() >= resetAt) {
			checks.clear()
			resetAt = Date.now() + 60_000
		}
		const count = checks.get(request.ip) ?? 0
		if (count >= 60) return reply.code(429).send({ code: 429, message: '登录状态检查过于频繁，请稍后重试' })
		checks.set(request.ip, count + 1)

		const token = readBrowserToken(request)
		const loggedIn = (await hasBrowserSession(token)) && (await verifySession())
		// 正在扫码的 token 还未入库，不能当作过期会话删除
		if (token && !loggedIn && !hasPendingQr(token)) setBrowserToken(request, reply)
		return { code: 200, data: { ...getSessionStatus(), loggedIn } }
	})

	fastify.post<{ Body: { cookie: string } }>(
		'/login',
		{
			bodyLimit: 20_000,
			schema: { body: { type: 'object', required: ['cookie'], properties: { cookie: { type: 'string', minLength: 1, maxLength: 16_384 } } } }
		},
		async (request, reply) => {
			const session = await saveSessionCookie(request.body.cookie, readBrowserToken(request))
			setBrowserToken(request, reply, session)
			return { code: 200, data: getSessionStatus() }
		}
	)

	fastify.delete('/login', async (request, reply) => {
		const token = readBrowserToken(request)
		await Promise.all([discardQr(token), revokeBrowserSession(token)])
		setBrowserToken(request, reply)
		return { code: 200, data: { loggedIn: false } }
	})

	fastify.post('/login-qr', async (request, reply) => ({ code: 200, data: await createBrowserQr(request, reply) }))

	fastify.post<{ Params: { key: string } }>(
		'/login-qr/:key',
		{ schema: { params: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1, maxLength: 256 } } } } },
		async (request, reply) => checkBrowserQr(request, reply, request.params.key)
	)
}
