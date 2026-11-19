import type { FastifyInstance } from 'fastify'
import { getSongEnergy } from '../services/radio/energy.js'
import { getMainPlayback } from '../services/radio/playback.js'
import { getRoamingSongs } from '../services/radio/roaming-sync.js'
import { ApiError } from '../utils/api-error.js'

// 下发歌曲低频强度包络，二进制正文附带帧率响应头
export default async function radioEnergyRoutes(fastify: FastifyInstance) {
	fastify.get<{ Params: { songId: string } }>('/radio-energy/:songId', async (request, reply) => {
		const songId = request.params.songId // 浏览器只提供歌曲 ID，不提供任意分析文件
		const song = getRoamingSongs().find(item => item.id === songId) ?? getMainPlayback().song
		if (!song || song.id !== songId) throw new ApiError(404, '歌曲已不在电台列表中')
		const energy = await getSongEnergy(songId)
		if (!energy) throw new ApiError(404, '歌曲包络尚未分析')
		reply.header('content-type', 'application/octet-stream')
		reply.header('x-envelope-rate', String(energy.sampleRate))
		return reply.send(energy.envelope)
	})
}
