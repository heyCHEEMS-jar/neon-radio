import { isRecord, type ServerMessage } from '@neon-radio/protocol'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { checkBrowserQr, startBrowserQr } from '../modules/session/index.js'
import { AppError } from '../platform/errors.js'
import { readRequestToken, setBrowserToken } from '../platform/http/cookie.js'
import { normalizeRequestPath } from '../platform/http/path.js'

const qrThrottleInterval = 5_000
const generationTimes = new Map<string, number>()

// 原生扫码接口不受路由限流保护，这里按 IP 限制二维码生成频率
function assertQrThrottle(ip: string) {
	const now = Date.now()
	for (const [visitor, time] of generationTimes) {
		if (now - time >= qrThrottleInterval) generationTimes.delete(visitor)
	}
	const previous = generationTimes.get(ip)
	if (previous !== undefined && now - previous < qrThrottleInterval) throw new AppError(429, { key: 'qr.rateLimited' })
	generationTimes.set(ip, now)
}

// 拦截原生扫码 Key 和状态接口，转交扫码流程，不返回账号 Cookie
export default async function neteaseQrCompat(request: FastifyRequest, reply: FastifyReply) {
	const path = normalizeRequestPath(request.url)
	if (!path) return reply.code(400).send({ code: 400, message: { key: 'request.invalidPath' } })
	if (!['/neon-radio/ncm/login/qr/key', '/neon-radio/ncm/login/qr/check'].includes(path)) return

	reply.header('Cache-Control', 'no-store')
	try {
		if (path.endsWith('/key')) {
			assertQrThrottle(request.ip)
			const started = startBrowserQr(readRequestToken(request))
			// 扫码前只标识浏览器，没有数据库会话记录就不算登录
			if (started.isNewToken) setBrowserToken(request, reply, { token: started.browserToken, expiresAt: started.expiresAt })
			const qr = await started.qr
			return reply.send({ code: 200, data: { code: 200, unikey: qr.key } })
		}
		const key = isRecord(request.query) && typeof request.query.key === 'string' ? request.query.key : ''
		if (!key) return reply.code(400).send({ code: 400, message: { key: 'qr.keyRequired' } })
		const result = await checkBrowserQr(readRequestToken(request), key)
		if (result.session) setBrowserToken(request, reply, result.session)
		return reply.send({ code: result.code, message: result.message })
	} catch (error: unknown) {
		const status = error instanceof AppError ? error.status : 502
		const message: ServerMessage = error instanceof AppError ? error.serverMessage : { key: 'qr.requestFailed' }
		return reply.code(status).send({ code: status, message })
	}
}
