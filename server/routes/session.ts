import type { FastifyInstance } from 'fastify'
import { getSessionStatus, saveSessionCookie } from '../services/netease-session.js'
import { checkQr, createQr } from '../services/qr-code.js'

export default async function sessionRoutes(fastify: FastifyInstance) {
	fastify.get('/login', async () => ({ code: 200, data: getSessionStatus() }))

	fastify.post<{ Body: { cookie: string } }>(
		'/login',
		{
			bodyLimit: 20_000,
			schema: { body: { type: 'object', required: ['cookie'], properties: { cookie: { type: 'string', minLength: 1, maxLength: 16_384 } } } }
		},
		async request => {
			await saveSessionCookie(request.body.cookie)
			return { code: 200, data: getSessionStatus() }
		}
	)

	fastify.post('/login-qr', async request => ({ code: 200, data: await createQr(request.ip) }))

	fastify.post<{ Params: { key: string } }>(
		'/login-qr/:key',
		{ schema: { params: { type: 'object', required: ['key'], properties: { key: { type: 'string', minLength: 1, maxLength: 256 } } } } },
		async request => checkQr(request.ip, request.params.key)
	)
}
