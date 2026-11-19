import type { IncomingMessage } from 'node:http'

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

export function isSafeMethod(method: string) {
	return safeMethods.has(method)
}
