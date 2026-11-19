import type { FastifyInstance } from 'fastify'
import { getChorus } from '../modules/chorus/index.js'
import { getMainPlayback } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { withSessionCookie } from '../modules/session/index.js'
import { AppError } from '../platform/errors.js'

// 副歌区间优先读数据库，未缓存时再请求网易云并落库
export default async function radioChorusRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-chorus/:songId', async request => {
		const songId = request.params.songId
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new AppError(404, '歌曲已不在电台列表中')
		return { code: 200, data: await withSessionCookie(cookie => getChorus(songId, cookie)) }
	})
}
