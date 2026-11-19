import type { IncomingMessage } from 'node:http'
import type { FastifyReply, FastifyRequest } from 'fastify'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const localAddresses = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

// 只信任本机反向代理转发的原始 Host
export function isSameOrigin(request: IncomingMessage) {
	const forwardedHost = request.headers['x-forwarded-host']
	const proxied = localAddresses.has(request.socket.remoteAddress || '')
	const host = proxied && typeof forwardedHost === 'string' ? forwardedHost.split(',')[0]?.trim() : request.headers.host
	if (!host || !request.headers.origin) return false
	try {
		const origin = new URL(request.headers.origin)
		return (origin.protocol === 'http:' || origin.protocol === 'https:') && origin.host === new URL(`${origin.protocol}//${host}`).host
	} catch {
		return false
	}
}

// 浏览器修改状态的 HTTP 请求必须来自本站
export default async function sameOriginGuard(request: FastifyRequest, reply: FastifyReply) {
	if (safeMethods.has(request.method)) return
	if (!isSameOrigin(request.raw)) return reply.code(403).send({ code: 403, message: '不允许跨站请求' })
}
