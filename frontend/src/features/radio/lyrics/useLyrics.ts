'use client'

import type { LyricLine } from '@neon-radio/protocol'
import { useEffect, useState, type RefObject } from 'react'
import { request } from '@/lib/request'

const cache = new Map<string, LyricLine[]>()
const cacheLimit = 30

export interface LyricsState {
	lines: LyricLine[]
	index: number
	current: LyricLine | null
	next: LyricLine | null
}

// 拉取并缓存歌词，按媒体实际播放位置定位当前行
export default function useLyrics(songId: string | undefined, audioRef: RefObject<HTMLAudioElement | null>, enabled: boolean): LyricsState {
	const [lines, setLines] = useState<LyricLine[]>([])
	const [index, setIndex] = useState(-1)

	// 切歌时读取缓存或拉取新歌词，没有歌词时保持空列表
	useEffect(() => {
		setIndex(-1)
		if (!songId) {
			setLines([])
			return
		}
		const cached = cache.get(songId)
		if (cached) {
			setLines(cached)
			return
		}
		const controller = new AbortController()
		setLines([])
		void (async () => {
			try {
				const { data } = await request<LyricLine[]>(`/neon-radio/radio-lyric/${encodeURIComponent(songId)}`, { signal: controller.signal })
				if (controller.signal.aborted) return
				const next = Array.isArray(data) ? data : []
				if (cache.size >= cacheLimit) {
					const oldest = cache.keys().next().value
					if (oldest) cache.delete(oldest)
				}
				cache.set(songId, next)
				setLines(next)
			} catch {
				// 纯音乐、无歌词或请求失败时不显示
			}
		})()
		return () => controller.abort()
	}, [songId])

	// 用媒体时间定位歌词，timeupdate 约 4 次/秒，足够逐行显示
	useEffect(() => {
		const audio = audioRef.current
		if (!audio || !enabled || !lines.length) {
			setIndex(-1)
			return
		}
		const update = () => {
			const positionMs = audio.currentTime * 1000
			let left = 0
			let right = lines.length
			while (left < right) {
				const middle = (left + right) >> 1
				if (lines[middle].timeMs <= positionMs) left = middle + 1
				else right = middle
			}
			setIndex(previous => (previous === left - 1 ? previous : left - 1))
		}
		update()
		audio.addEventListener('timeupdate', update)
		return () => audio.removeEventListener('timeupdate', update)
	}, [audioRef, enabled, lines])

	return { lines, index, current: index >= 0 ? (lines[index] ?? null) : null, next: index >= 0 ? (lines[index + 1] ?? null) : null }
}
