import { isRecord } from '@neon-radio/protocol'
import type { RadioAudioSource } from '@neon-radio/protocol'
import { AppError } from '../errors.js'
import { requestSongUrl, requireOk } from './client.js'

// 解析网易云取链响应：地址、实际可播时长、试听边界和链接过期时间
export async function fetchSongAudio(
	songId: string,
	cookie: string,
	fallbackDurationMs: number
): Promise<RadioAudioSource & { expiresAt: number }> {
	const response = requireOk(await requestSongUrl(songId, cookie), '网易云取链请求失败')
	const data = response.body.data
	const item = Array.isArray(data) ? data.find(value => isRecord(value) && String(value.id) === songId) : undefined
	if (!isRecord(item) || typeof item.url !== 'string' || !item.url) throw new AppError(422, '当前歌曲暂无可播放音源')

	// 不把已获完整权益的付费歌曲误标为试听
	const info = isRecord(item.freeTrialInfo) ? item.freeTrialInfo : null
	const trial = info ? { start: typeof info.start === 'number' ? info.start : 0, end: typeof info.end === 'number' ? info.end : 0 } : null
	const duration = typeof item.time === 'number' && Number.isFinite(item.time) && item.time > 0 ? item.time : fallbackDurationMs
	const durationMs = trial && trial.end > trial.start ? Math.min(duration, (trial.end - trial.start) * 1000) : duration
	if (!Number.isFinite(durationMs) || durationMs <= 0) throw new AppError(422, '当前音源时长无效')

	const url = new URL(item.url)
	if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new AppError(502, '音源地址异常')
	url.protocol = 'https:'
	const expiresAt = Date.now() + (typeof item.expi === 'number' ? Math.max(0, item.expi * 1000 - 1000) : 0)
	return { src: url.toString(), durationMs, trial, expiresAt }
}
