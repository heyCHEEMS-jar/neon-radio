import type { FastifyInstance } from 'fastify'
import config from '../config.js'
import { UpstreamError } from '../platform/errors.js'
import { ncmApi, ncmOptions, requireOk } from '../platform/netease/client.js'
import { withSessionCookie } from '../modules/session/index.js'

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
		const response = await withSessionCookie(async cookie => requireOk(await ncmApi.user_playlist({ ...ncmOptions, uid: config.NETEASE_UID, limit, offset, cookie })))
		if (!Array.isArray(response.body.playlist)) throw new UpstreamError('unavailable', '网易云返回的歌单列表异常')
		// 不向前端透传网易云原始 Cookie
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
			const response = await withSessionCookie(async cookie => requireOk(await ncmApi.playlist_track_all({ ...ncmOptions, id: request.params.id, limit, offset, cookie })))
			if (!Array.isArray(response.body.songs)) throw new UpstreamError('unavailable', '网易云返回的歌曲列表异常')
			const body: Record<string, unknown> = { ...response.body }
			delete body.cookie
			return body
		}
	)
}
