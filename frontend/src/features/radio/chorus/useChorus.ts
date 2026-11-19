'use client'

import type { ChorusRange } from '@neon-radio/protocol'
import { useEffect, useState, type RefObject } from 'react'
import { request } from '@/lib/request'

const cache = new Map<string, ChorusRange | null>()
const cacheLimit = 30

// 拉取网易云标注的副歌区间，并按媒体进度判断是否正处于高潮段
export default function useChorus(songId: string | undefined, audioRef: RefObject<HTMLAudioElement | null>, enabled: boolean) {
	const [range, setRange] = useState<ChorusRange | null>(null)
	const [inChorus, setInChorus] = useState(false)

	// 每首歌只请求一次，未标注副歌时缓存 null
	useEffect(() => {
		setInChorus(false)
		if (!songId) {
			setRange(null)
			return
		}
		if (cache.has(songId)) {
			setRange(cache.get(songId) ?? null)
			return
		}
		const controller = new AbortController()
		setRange(null)
		void (async () => {
			try {
				const { data } = await request<ChorusRange | null>(`/neon-radio/radio-chorus/${encodeURIComponent(songId)}`, { signal: controller.signal })
				if (controller.signal.aborted) return
				const value = data && typeof data.startMs === 'number' && typeof data.endMs === 'number' && data.endMs > data.startMs ? data : null
				if (cache.size >= cacheLimit) {
					const oldest = cache.keys().next().value
					if (oldest) cache.delete(oldest)
				}
				cache.set(songId, value)
				setRange(value)
			} catch {
				// 未标注副歌或请求失败时保持关闭
			}
		})()
		return () => controller.abort()
	}, [songId])

	// 用媒体时间判断是否进入副歌段，暂停时保留当前状态
	useEffect(() => {
		const audio = audioRef.current
		if (!audio || !enabled || !range) {
			setInChorus(false)
			return
		}
		const update = () => {
			const positionMs = audio.currentTime * 1000
			const inside = positionMs >= range.startMs && positionMs < range.endMs
			setInChorus(previous => (previous === inside ? previous : inside))
		}
		update()
		// timeupdate 覆盖正常播放，seeked 保证拖动后立即判断
		audio.addEventListener('timeupdate', update)
		audio.addEventListener('seeked', update)
		return () => {
			audio.removeEventListener('timeupdate', update)
			audio.removeEventListener('seeked', update)
		}
	}, [audioRef, enabled, range])

	return { range, inChorus }
}
