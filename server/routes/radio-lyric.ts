import type { FastifyInstance } from 'fastify'
import { getLyric } from '../modules/lyric/index.js'
import { getMainPlayback } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { withSessionCookie } from '../modules/session/index.js'
import { AppError } from '../platform/errors.js'

// 歌词优先读数据库，未缓存时再请求网易云并落库
export default async function radioLyricRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-lyric/:songId', async request => {
		const songId = request.params.songId
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new AppError(404, { key: 'song.notInRadio' })
		return { code: 200, data: await withSessionCookie(cookie => getLyric(songId, cookie)) }
	})
}
