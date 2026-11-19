import { requestSongAudio } from '../../integrations/netease/client.js'
import { ApiError } from '../../utils/api-error.js'
import { isRecord } from '../../utils/object.js'
import { getSessionCookie, withSessionCookie } from '../session/netease-session.js'
import { roamingSongsEvents, type RadioSong } from './roaming-sync.js'

interface RadioAudio {
	src: string
	durationMs: number // 当前音源实际可播时长，试听只计算试听片段
	trial: { start: number; end: number } | null
}

interface CachedAudio {
	request: Promise<RadioAudio> // 主线准备和多个听众共用同一次取链
	expiresAt: number // 网易云返回的链接过期时间
	source?: RadioAudio // 已解析的音源，供主线同步读取实际时长
}

const sources = new Map<string, CachedAudio>() // 按歌曲缓存音源，不缓存音频文件
let sessionCookie = '' // 缓存只对应当前电台账号的登录权益
roamingSongsEvents.on('change', () => sources.clear())

// 已解析过的歌曲直接采用音源时长，尚未解析时暂用歌曲元数据
export function getAudioDuration(song: RadioSong) {
	return sources.get(song.id)?.source?.durationMs ?? song.duration
}

// 解析业务层已确认的歌曲，固定账号凭证不进入浏览器
export async function getRadioAudio(song: RadioSong): Promise<RadioAudio> {
	const cookie = getSessionCookie() // 账号或会员权益变化后不复用旧音源
	if (cookie !== sessionCookie) {
		sources.clear()
		sessionCookie = cookie
	}
	const cached = sources.get(song.id)
	if (cached && cached.expiresAt > Date.now()) return cached.request

	const request = withSessionCookie(value => requestSongAudio(song.id, value)) // 原始取链请求，解析完成后发布缓存
	const entry: CachedAudio = {
		expiresAt: Infinity, // 解析期间合并请求，完成后使用上游有效期
		request: request
			.then(response => {
				const data = response.body.data
				const item: unknown = Array.isArray(data) ? data.find(value => isRecord(value) && String(value.id) === song.id) : undefined
				if (!isRecord(item) || typeof item.url !== 'string' || !item.url) throw new ApiError(422, '当前歌曲暂无可播放音源')
				if (getSessionCookie() !== cookie) throw new ApiError(409, '登录状态已更新，请重试')
				const info = isRecord(item.freeTrialInfo) ? item.freeTrialInfo : null // 不把已获完整权益的付费歌曲误标为试听
				const trial = info ? { start: typeof info.start === 'number' ? info.start : 0, end: typeof info.end === 'number' ? info.end : 0 } : null
				const duration = typeof item.time === 'number' && Number.isFinite(item.time) && item.time > 0 ? item.time : song.duration
				const durationMs = trial && trial.end > trial.start ? Math.min(duration, (trial.end - trial.start) * 1000) : duration
				if (!Number.isFinite(durationMs) || durationMs <= 0) throw new ApiError(422, '当前音源时长无效')
				const url = new URL(item.url)
				if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new ApiError(502, '音源地址异常')
				url.protocol = 'https:'
				const source = { src: url.toString(), durationMs, trial }
				entry.source = source
				entry.expiresAt = Date.now() + (typeof item.expi === 'number' ? Math.max(0, item.expi * 1000 - 1000) : 0)
				return source
			})
			.catch((error: unknown) => {
				if (sources.get(song.id) === entry) sources.delete(song.id)
				throw error
			})
	}
	sources.set(song.id, entry)
	return entry.request
}
