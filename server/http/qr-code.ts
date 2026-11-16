import { randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { browserSessionMaxAge, hasBrowserSession } from '../services/session/browser-session.js'
import { checkQr, createQr } from '../services/session/qr-code.js'
import { readBrowserToken, setBrowserToken } from './browser-token.js'

// 读取或创建扫码标识，将二维码绑定到当前浏览器
export async function createBrowserQr(request: FastifyRequest, reply: FastifyReply) {
	let token = readBrowserToken(request)
	if (!token) {
		token = randomBytes(32).toString('hex')
		// 扫码前只标识浏览器，没有数据库会话记录就不算登录
		setBrowserToken(request, reply, { token, expiresAt: Date.now() + browserSessionMaxAge * 1000 })
	}
	return createQr(token, request.ip)
}

// 扫码成功后写入正式 token，响应中只返回扫码状态
export async function checkBrowserQr(request: FastifyRequest, reply: FastifyReply, key: string) {
	const result = await checkQr(readBrowserToken(request), key)
	if (result.session) {
		if (!(await hasBrowserSession(result.session.token))) return { code: 800, message: '登录已失效，请重新生成二维码' }
		setBrowserToken(request, reply, result.session)
	}
	return { code: result.code, message: result.message }
}
