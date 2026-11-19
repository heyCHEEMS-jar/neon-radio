import { isRecord } from '@neon-radio/protocol'
import type { LyricLine } from '@neon-radio/protocol'
import { UpstreamError } from '../errors.js'
import { createLogger } from '../logger.js'
import { ncmApi, ncmOptions, requireOk } from './client.js'

const logger = createLogger('网易云歌词')
const timeTagPattern = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g

// 解析 LRC：支持一行多个时间标签，忽略 ar/ti 等元信息
function parseLrc(source: string) {
	const lines: { timeMs: number; text: string }[] = []
	for (const raw of source.split(/\r?\n/)) {
		const text = raw.replace(/\[[^\]]*\]/g, '').trim()
		if (!text) continue
		for (const match of raw.matchAll(timeTagPattern)) {
			const minutes = Number(match[1])
			const seconds = Number(match[2])
			const fraction = match[3] ? Number(match[3].padEnd(3, '0')) : 0
			lines.push({ timeMs: minutes * 60_000 + seconds * 1000 + fraction, text })
		}
	}
	return lines.sort((left, right) => left.timeMs - right.timeMs)
}

// 请求歌词正文；lyric 网络失败时回退 lyric_new，登录失效仍按原错误上报
async function requestLyricBody(songId: string, cookie: string) {
	try {
		return requireOk(await ncmApi.lyric({ ...ncmOptions, id: songId, cookie }), '网易云歌词请求失败').body
	} catch (error: unknown) {
		if (error instanceof UpstreamError && error.kind === 'expired') throw error
		logger.warn('lyric 接口失败，回退 lyric_new：' + (error instanceof Error ? error.message : '网络错误'))
		const response = await ncmApi.lyric_new({ ...ncmOptions, id: songId, cookie }).catch((cause: unknown) => {
			throw new UpstreamError('unavailable', '网易云歌词请求失败', cause)
		})
		return requireOk(response, '网易云歌词请求失败').body
	}
}

// 取原文歌词并按时间点合并翻译，纯音乐或接口无歌词时返回空数组
export async function fetchLyric(songId: string, cookie: string): Promise<LyricLine[]> {
	const body = await requestLyricBody(songId, cookie)
	const lrc = isRecord(body.lrc) && typeof body.lrc.lyric === 'string' ? body.lrc.lyric : ''
	if (!lrc) return []
	const translations = new Map(
		(isRecord(body.tlyric) && typeof body.tlyric.lyric === 'string' ? parseLrc(body.tlyric.lyric) : []).map(line => [line.timeMs, line.text])
	)
	return parseLrc(lrc).map(line => ({ ...line, translation: translations.get(line.timeMs) ?? null }))
}
