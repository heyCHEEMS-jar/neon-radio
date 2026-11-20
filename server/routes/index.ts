import type { FastifyError, FastifyInstance } from 'fastify'
import type { ServerMessage } from '@neon-radio/protocol'
import { AppError, RateLimitError, UpstreamError } from '../platform/errors.js'
import playlistRoutes from './playlists.js'
import radioAudioRoutes from './radio-audio.js'
import radioImpactsRoutes from './radio-impacts.js'
import radioChorusRoutes from './radio-chorus.js'
import radioLyricRoutes from './radio-lyric.js'
import radioOptionsRoutes from './radio-options.js'
import sessionRoutes from './session.js'

// 全项目唯一的 HTTP 错误映射，业务只抛 AppError，适配层只抛 UpstreamError
function toResponse(error: unknown) {
	if (error instanceof AppError) return { status: error.status, code: error.code, message: error.serverMessage }
	// 上游错误只按类别映射，不向前端透传第三方原文
	if (error instanceof UpstreamError) {
		const status = error.kind === 'expired' ? 401 : error.kind === 'forbidden' ? 403 : 502
		const message: ServerMessage = { key: error.kind === 'expired' ? 'upstream.expired' : error.kind === 'forbidden' ? 'upstream.forbidden' : 'upstream.failed' }
		return { status, code: status, message }
	}
	return null
}

export default async function indexRoutes(fastify: FastifyInstance) {
	fastify.addHook('onRequest', async (_request, reply) => {
		reply.header('Cache-Control', 'private, no-store')
	})
	fastify.setErrorHandler((error: FastifyError, request, reply) => {
		const mapped = toResponse(error)
		if (mapped) return reply.code(mapped.status).send({ code: mapped.code, message: mapped.message })
		if (error.validation) return reply.code(400).send({ code: 400, message: { key: 'request.invalidParams' } })
		// 限流插件自带 429，保留它的提示和状态
		if (error instanceof RateLimitError) return reply.code(429).send({ code: 429, message: error.serverMessage })
		request.log.warn({ err: error }, '电台接口请求失败')
		return reply.code(500).send({ code: 500, message: { key: 'server.internal' } })
	})

	await fastify.register(playlistRoutes)
	await fastify.register(sessionRoutes)
	await fastify.register(radioOptionsRoutes)
	await fastify.register(radioAudioRoutes)
	await fastify.register(radioImpactsRoutes)
	await fastify.register(radioLyricRoutes)
	await fastify.register(radioChorusRoutes)
}
