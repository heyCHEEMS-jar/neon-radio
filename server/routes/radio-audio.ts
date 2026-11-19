import type { FastifyInstance } from 'fastify'
import { getMainPlayback, getRadioAudio } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { AppError } from '../platform/errors.js'

// 只允许电台列表或当前主线歌曲取链，账号权限留在音源服务处理
export default async function radioAudioRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-audio/:songId', async request => {
		const songId = request.params.songId // 浏览器只提供歌曲 ID，不提供任意音源地址
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new AppError(404, '歌曲已不在电台列表中')
		return { code: 200, data: await getRadioAudio(song) }
	})
}
