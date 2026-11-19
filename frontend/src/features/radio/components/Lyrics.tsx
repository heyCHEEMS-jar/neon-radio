'use client'

import { useContext, useRef } from 'react'
import { RadioAudioContext } from '@/audio'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'
import useLyrics from '@/features/radio/lyrics/useLyrics'

// 浮动在播放器上方的两行歌词，无歌词时不占位
export default function Lyrics({ visible }: { visible: boolean }) {
	const audio = useContext(RadioAudioContext)
	const live = useContext(RadioLiveContext)
	const fallbackRef = useRef<HTMLAudioElement | null>(null)
	const audioRef = audio?.audioRef ?? fallbackRef
	const enabled = Boolean(visible && audio?.started && live?.playback?.song)
	const { current, next } = useLyrics(live?.playback?.song?.id, audioRef, enabled)
	if (!visible || !current) return null

	return (
		<div className="pointer-events-none fixed inset-x-0 z-30 flex flex-col items-center gap-0.5 px-4 text-center" style={{ bottom: 'calc(100px + env(safe-area-inset-bottom))' }}>
			<p
				key={current.timeMs}
				className="lyric-line m-0 max-w-[min(88vw,640px)] text-balance text-[clamp(14px,2.2vw,18px)] font-light text-white/90 [text-shadow:0_2px_12px_rgba(0,0,0,0.75)]"
			>
				{current.text}
			</p>
			{current.translation && (
				<p className="m-0 max-w-[min(88vw,640px)] text-[clamp(11px,1.7vw,13px)] text-white/55 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
					{current.translation}
				</p>
			)}
			{next && (
				<p className="m-0 max-w-[min(88vw,640px)] truncate text-[clamp(11px,1.7vw,13px)] text-white/35 [text-shadow:0_2px_10px_rgba(0,0,0,0.7)]">
					{next.text}
				</p>
			)}
		</div>
	)
}
