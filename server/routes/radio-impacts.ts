import type { FastifyInstance } from 'fastify'
import { getTimeline } from '../audio/index.js'
import { getMainPlayback } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { AppError } from '../platform/errors.js'

// 下发当前列表歌曲的震动时间轴，不向前端传输 PCM 或连续频谱
export default async function radioImpactsRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-impacts/:songId', async request => {
		const songId = request.params.songId
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new AppError(404, { key: 'song.notInRadio' })
		const timeline = await getTimeline(songId)
		if (!timeline) throw new AppError(404, { key: 'impacts.pending' })
		return { code: 200, data: timeline }
	})
}
