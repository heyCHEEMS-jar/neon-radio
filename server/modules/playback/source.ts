import type { RadioAudioSource } from '@neon-radio/protocol'
import { AppError } from '../../platform/errors.js'
import { fetchSongAudio } from '../../platform/netease/audio-source.js'
import { songsEvents } from '../roaming/index.js'
import { getSessionCookie, withSessionCookie } from '../session/index.js'

interface CachedSource extends RadioAudioSource {
	expiresAt: number
}

interface SourceEntry {
	request: Promise<CachedSource>
	expiresAt: number
	source?: CachedSource
}

const sources = new Map<string, SourceEntry>()
let sessionCookie = ''
songsEvents.on('change', () => sources.clear())

// 已解析过的歌曲直接采用音源时长，尚未解析时暂用歌曲元数据
export function getAudioDuration(song: { id: string; durationMs: number }) {
	return sources.get(song.id)?.source?.durationMs ?? song.durationMs
}

// 解析业务层已确认的歌曲，固定账号凭证不进入浏览器
export async function getRadioAudio(song: { id: string; durationMs: number }): Promise<RadioAudioSource> {
	const cookie = getSessionCookie()
	// 账号或会员权益变化后不复用旧音源
	if (cookie !== sessionCookie) {
		sources.clear()
		sessionCookie = cookie
	}
	const cached = sources.get(song.id)
	if (cached && cached.expiresAt > Date.now()) return cached.request

	let entry: SourceEntry
	// 主线准备和多个听众共用同一次取链
	const request = withSessionCookie(value => fetchSongAudio(song.id, value, song.durationMs))
		.then(source => {
			if (getSessionCookie() !== cookie) throw new AppError(409, { key: 'session.updated' })
			entry.source = source
			entry.expiresAt = source.expiresAt
			return source
		})
		.catch((error: unknown) => {
			if (sources.get(song.id) === entry) sources.delete(song.id)
			throw error
		})
	entry = { request, expiresAt: Infinity }
	sources.set(song.id, entry)
	return request
}

// 音频层只需要地址，不接触会话和缓存细节
export async function resolveAudioSrc(song: { id: string; durationMs: number }) {
	return (await getRadioAudio(song)).src
}
