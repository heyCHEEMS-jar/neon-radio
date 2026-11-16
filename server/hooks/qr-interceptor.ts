import type { FastifyReply, FastifyRequest } from 'fastify'
import { checkBrowserQr, createBrowserQr } from '../http/qr-code.js'
import { ApiError } from '../utils/api-error.js'
import { isRecord } from '../utils/object.js'
import { normalizeRequestPath } from '../utils/request-path.js'

// 拦截原生扫码 Key 和状态接口，转交扫码流程，不返回账号 Cookie
export default async function qrInterceptor(request: FastifyRequest, reply: FastifyReply) {
	let path: string
	try {
		path = normalizeRequestPath(request.url)
	} catch {
		return reply.code(400).send({ code: 400, message: '请求路径不合法' })
	}
	if (!['/neon-radio/ncm/login/qr/key', '/neon-radio/ncm/login/qr/check'].includes(path)) return

	reply.header('Cache-Control', 'no-store')
	try {
		if (path.endsWith('/key')) {
			const qr = await createBrowserQr(request, reply)
			return reply.send({ code: 200, data: { code: 200, unikey: qr.key } })
		}
		const key = isRecord(request.query) && typeof request.query.key === 'string' ? request.query.key : ''
		if (!key) return reply.code(400).send({ code: 400, message: '请通过查询参数提供二维码 Key' })
		return reply.send(await checkBrowserQr(request, reply, key))
	} catch (error: unknown) {
		const status = error instanceof ApiError ? error.statusCode : 502
		return reply.code(status).send({ code: status, message: error instanceof ApiError ? error.message : '扫码接口请求失败' })
	}
}
