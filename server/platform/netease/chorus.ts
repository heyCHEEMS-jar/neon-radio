import type { ChorusRange } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'
import { UpstreamError } from '../errors.js'
import { ncmApi, ncmOptions, requireOk } from './client.js'

// 取网易云标注的副歌区间，未标注时返回 null
export async function fetchChorus(songId: string, cookie: string): Promise<ChorusRange | null> {
	// 网络错误也归到上游不可用，避免路由层落成 500
	const response = await ncmApi.song_chorus({ ...ncmOptions, id: songId, cookie }).catch((error: unknown) => {
		throw new UpstreamError('unavailable', '网易云副歌时间请求失败', error)
	})
	const body = requireOk(response, '网易云副歌时间请求失败').body
	const list = Array.isArray(body.chorus) ? body.chorus : Array.isArray(body.data) ? body.data : []
	const item = list.find(value => isRecord(value) && String(value.id) === songId) ?? list[0]
	if (!isRecord(item)) return null
	const startMs = typeof item.startTime === 'number' ? item.startTime : 0
	const endMs = typeof item.endTime === 'number' ? item.endTime : 0
	return startMs >= 0 && endMs > startMs ? { startMs, endMs } : null
}
