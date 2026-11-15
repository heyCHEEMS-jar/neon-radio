import type { FastifyInstance } from 'fastify'
import config from '../config.js'
import { ApiError, ncmApi, ncmOptions } from '../utils/ncm.js'
import { withSessionCookie } from '../services/netease-session.js'

interface Pagination {
	limit: number
	offset: number
}

const paginationSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 1000, default: 5 },
		offset: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER, default: 0 }
	}
}

export default async function playlistRoutes(fastify: FastifyInstance) {
	fastify.get<{ Querystring: Pagination }>('/lists', { schema: { querystring: paginationSchema } }, async request => {
		const { limit, offset } = request.query
		const response = await withSessionCookie(cookie => ncmApi.user_playlist({ ...ncmOptions, uid: config.NETEASE_UID, limit, offset, cookie }))
		if (!Array.isArray(response.body.playlist)) throw new ApiError(502, '网易云返回的歌单列表异常')
		const body: Record<string, unknown> = { ...response.body }
		delete body.cookie
		return body
	})

	fastify.get<{ Params: { id: string }; Querystring: Pagination }>(
		'/lists/:id/songs',
		{
			schema: {
				params: { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[1-9][0-9]*$', maxLength: 20 } } },
				querystring: paginationSchema
			}
		},
		async request => {
			const { limit, offset } = request.query
			const response = await withSessionCookie(cookie => ncmApi.playlist_track_all({ ...ncmOptions, id: request.params.id, limit, offset, cookie }))
			if (!Array.isArray(response.body.songs)) throw new ApiError(502, '网易云返回的歌曲列表异常')
			const body: Record<string, unknown> = { ...response.body }
			delete body.cookie
			return body
		}
	)
}
