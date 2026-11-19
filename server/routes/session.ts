import type { FastifyInstance } from 'fastify'
import { checkBrowserQr, discardQr, getSessionStatus, hasBrowserSession, hasPendingQr, revokeBrowserSession, saveSessionCookie, startBrowserQr, verifySession } from '../modules/session/index.js'
import { clearBrowserToken, readRequestToken, setBrowserToken } from '../platform/http/cookie.js'

// 注册登录状态、扫码和退出接口
export default async function sessionRoutes(fastify: FastifyInstance) {
	fastify.get('/login', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
		const token = readRequestToken(request)
		const loggedIn = (await hasBrowserSession(token)) && (await verifySession())
		// 正在扫码的 token 还未入库，不能当作过期会话删除
		if (token && !loggedIn && !hasPendingQr(token)) clearBrowserToken(reply)
		return { code: 200, data: { ...getSessionStatus(), loggedIn } }
	})

	fastify.post<{ Body: { cookie: string } }>(
		'/login',
		{
			bodyLimit: 20_000,
			schema: { body: { type: 'object', required: ['cookie'], properties: { cookie: { type: 'string', minLength: 1, maxLength: 16_384 } } } }
		},
		async (request, reply) => {
			const session = await saveSessionCookie(request.body.cookie, readRequestToken(request))
			setBrowserToken(request, reply, session)
			return { code: 200, data: getSessionStatus() }
		}
	)

	fastify.delete('/login', async (request, reply) => {
		const token = readRequestToken(request)
		await Promise.all([discardQr(token), revokeBrowserSession(token)])
		clearBrowserToken(reply)
		return { code: 200, data: { loggedIn: false } }
	})

	fastify.post('/login-qr', { config: { rateLimit: { max: 12, timeWindow: '1 minute' } } }, async (request, reply) => {
		const started = startBrowserQr(readRequestToken(request))
		// 扫码前只标识浏览器，没有数据库会话记录就不算登录
		if (started.isNewToken) setBrowserToken(request, reply, { token: started.browserToken, expiresAt: started.expiresAt })
		return { code: 200, data: await started.qr }
	})

	fastify.post<{ Params: { key: string } }>(
		'/login-qr/:key',
		{ schema: { params: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1, maxLength: 256 } } } } },
		async (request, reply) => {
			const result = await checkBrowserQr(readRequestToken(request), request.params.key)
			if (result.session) setBrowserToken(request, reply, result.session)
			return { code: result.code, message: result.message }
		}
	)
}
