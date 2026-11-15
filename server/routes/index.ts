import type { FastifyInstance } from 'fastify'
import config from '../config.js'
import { closeDatabase } from '../utils/db.js'
import { ApiError, isRecord } from '../utils/ncm.js'
import { initSession, refreshSession, waitForSessionUpdates } from '../services/netease-session.js'
import { clearQrCache } from '../services/qr-code.js'
import playlistRoutes from './playlists.js'
import sessionRoutes from './session.js'

const errorMessages: Record<number, string> = {
	401: '网易云登录已失效，请重新扫码',
	403: '网易云拒绝访问该资源',
	404: '用户或歌单不存在',
	500: '电台服务内部错误',
	502: '网易云请求失败，请稍后重试'
}

export default async function indexRoutes(fastify: FastifyInstance) {
	await initSession()
	fastify.addHook('onRequest', async (_request, reply) => {
		reply.header('Cache-Control', 'private, no-store')
	})
	fastify.setErrorHandler((error, request, reply) => {
		if (isRecord(error) && error.validation) return reply.code(400).send({ code: 400, message: '请求参数不合法' })
		if (error instanceof ApiError) return reply.code(error.statusCode).send({ code: error.code, message: error.message })
		const body = isRecord(error) && isRecord(error.body) ? error.body : undefined
		const nativeStatus = isRecord(error) && typeof error.statusCode === 'number' ? error.statusCode : body ? 502 : 500
		const code = typeof body?.code === 'number' && Number.isInteger(body.code) ? body.code : nativeStatus
		const statusCode = code === 301 ? 401 : code >= 400 && code < 500 ? code : nativeStatus
		const status = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 500
		request.log.warn({ code, statusCode: status }, '电台接口请求失败')
		return reply.code(status).send({ code, message: errorMessages[status] || '请求失败' })
	})

	await fastify.register(playlistRoutes)
	await fastify.register(sessionRoutes)

	const timer = setInterval(() => {
		void refreshSession().catch(() => fastify.log.warn('电台 Cookie 定时刷新失败'))
	}, config.COOKIE_REFRESH_HOURS * 60 * 60 * 1000)
	timer.unref()
	fastify.addHook('onClose', async () => {
		clearInterval(timer)
		clearQrCache()
		await waitForSessionUpdates()
		await closeDatabase()
	})
}
