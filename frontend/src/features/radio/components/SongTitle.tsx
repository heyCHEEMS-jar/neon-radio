'use client'

import type { RadioSong } from '@neon-radio/protocol'
import { useEffect, useState } from 'react'
import BlurText from '@/components/ui/blur-text'

const replayInterval = 8_000

// 顶部歌名与作者，切歌时通过 key 重新播放凝聚动画
export default function SongTitle({ song }: { song: RadioSong | null }) {
	const [revision, setRevision] = useState(0)

	// 每隔几秒重新挂载一次，让歌名与作者同步重播凝聚动画
	useEffect(() => {
		if (!song) return
		const timer = setInterval(() => setRevision(value => value + 1), replayInterval)
		return () => clearInterval(timer)
	}, [song?.id])

	if (!song) return null
	const artists = song.artists.join(' / ')

	return (
		<div className="pointer-events-none absolute inset-x-0 top-[clamp(28px,9svh,96px)] z-10 flex flex-col items-center gap-1 px-4 text-center">
			<BlurText
				key={`${song.id}-name-${revision}`}
				text={song.name}
				animateBy="word"
				from="center"
				scale={2.4}
				blur={10}
				duration={0.8}
				wordDelay={0.12}
				color="#ffffff"
				fontSize="text-[clamp(22px,3.8vw,52px)]"
				className="w-full max-w-[min(92vw,900px)] font-mono [text-shadow:0_4px_24px_rgba(0,0,0,0.65)]"
			/>
			{artists && (
				<BlurText
					key={`${song.id}-artists-${revision}`}
					text={artists}
					animateBy="word"
					from="center"
					scale={1.6}
					blur={8}
					duration={0.6}
					wordDelay={0.08}
					color="#ffffff"
					fontSize="text-[clamp(11px,1.5vw,16px)]"
					className="w-full max-w-[min(92vw,900px)] font-mono opacity-70 [text-shadow:0_2px_14px_rgba(0,0,0,0.7)]"
				/>
			)}
		</div>
	)
}
