import type { FastifyInstance } from 'fastify'
import { getMainPlayback } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { withSessionCookie } from '../modules/session/index.js'
import { AppError } from '../platform/errors.js'
import { fetchLyric } from '../platform/netease/lyric.js'

// 歌词与音源一样按歌曲 ID 下发，游客也能看到当前歌曲的歌词
export default async function radioLyricRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-lyric/:songId', async request => {
		const songId = request.params.songId
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new AppError(404, '歌曲已不在电台列表中')
		return { code: 200, data: await withSessionCookie(cookie => fetchLyric(songId, cookie)) }
	})
}
