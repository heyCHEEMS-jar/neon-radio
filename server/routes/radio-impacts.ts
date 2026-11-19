import type { FastifyInstance } from 'fastify'
import { getSongImpacts } from '../services/radio/audio-analysis.js'
import { getMainPlayback } from '../services/radio/playback.js'
import { getRoamingSongs } from '../services/radio/roaming-sync.js'
import { ApiError } from '../utils/api-error.js'

// 下发当前列表歌曲的震动时间轴，不向前端传输 PCM 或连续频谱
export default async function radioImpactsRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-impacts/:songId', async request => {
		const songId = request.params.songId
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new ApiError(404, '歌曲已不在电台列表中')
		const timeline = await getSongImpacts(songId)
		if (!timeline) throw new ApiError(404, '歌曲震动时间轴尚未分析')
		return { code: 200, data: timeline }
	})
}
