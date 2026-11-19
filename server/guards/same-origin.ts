import type { FastifyReply, FastifyRequest } from 'fastify'
import { isSameOrigin, isSafeMethod } from '../platform/http/same-origin.js'

// 浏览器修改状态的 HTTP 请求必须来自本站
export default async function sameOriginGuard(request: FastifyRequest, reply: FastifyReply) {
	if (isSafeMethod(request.method)) return
	if (!isSameOrigin(request.raw)) return reply.code(403).send({ code: 403, message: '不允许跨站请求' })
}
