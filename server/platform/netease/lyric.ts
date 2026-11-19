import { isRecord } from '@neon-radio/protocol'
import type { LyricLine } from '@neon-radio/protocol'
import { ncmApi, ncmOptions, requireOk } from './client.js'

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

// 取原文歌词并按时间点合并翻译，纯音乐或接口无歌词时返回空数组
export async function fetchLyric(songId: string, cookie: string): Promise<LyricLine[]> {
	const response = requireOk(await ncmApi.lyric({ ...ncmOptions, id: songId, cookie }), '网易云歌词请求失败')
	const body = response.body
	const lrc = isRecord(body.lrc) && typeof body.lrc.lyric === 'string' ? body.lrc.lyric : ''
	if (!lrc) return []
	const translations = new Map(
		(isRecord(body.tlyric) && typeof body.tlyric.lyric === 'string' ? parseLrc(body.tlyric.lyric) : []).map(line => [line.timeMs, line.text])
	)
	return parseLrc(lrc).map(line => ({ ...line, translation: translations.get(line.timeMs) ?? null }))
}
