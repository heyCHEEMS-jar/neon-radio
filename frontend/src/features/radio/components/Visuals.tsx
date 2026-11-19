'use client'

import { useContext, useEffect, useState } from 'react'
import { RadioAudioContext, useVisualizer } from '@/audio'
import { visualizerConfig as config } from '@/audio/visualizer/config'
import { getPlaybackPosition, RadioLiveContext } from '@/features/radio/live/useRadioLive'
import { useMediaQuery } from '@/lib/use-media-query'
import { RadioSceneContext, SceneRefContext } from '@/features/radio/scene'
import ChorusBackdrop from './ChorusBackdrop'
import SongTitle from './SongTitle'

const edgeClassName =
	'absolute left-0 block h-[clamp(72px,15svh,144px)] w-full opacity-70 [mask-image:linear-gradient(to_right,transparent,#000_16%,#000_84%,transparent)]'

const infoClassName =
	'min-w-0 translate-y-1/2 border-t-[clamp(1px,0.3vw,5px)] border-white/70 pt-[clamp(6px,0.8vw,12px)] text-center text-[clamp(10px,2.4vw,40px)] font-light text-[#e6cbd6] [text-shadow:0_2px_12px_rgba(0,0,0,0.65)]'

// 描边随中心容器宽度缩放，最细保留1px
const frameClassName = 'absolute top-1/2 left-1/2 aspect-square w-[64%] md:w-[50%] -translate-x-1/2 -translate-y-1/2 border-[clamp(1px,1.05cqw,5px)]'

function formatTime(milliseconds: number) {
	const seconds = Math.floor(milliseconds / 1000)
	return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export default function Visuals() {
	const active = useContext(RadioSceneContext)
	const sceneRef = useContext(SceneRefContext)
	const isMobile = useMediaQuery('(max-width: 767px)')
	const live = useContext(RadioLiveContext)
	const audio = useContext(RadioAudioContext) // 展示媒体实际进度，暂停后不继续递增本页时间
	const playback = live?.playback ?? null
	const [now, setNow] = useState(Date.now())
	const animationPlayState = active ? 'running' : 'paused'
	const { visualsRef, centerRef, ringRef, coverRef, imageRef, topRef, bottomRef } = useVisualizer(active, sceneRef)
	const song = playback?.song ?? null
	const media = audio?.audioRef.current // 所有播放 UI 共用媒体时钟
	const position =
		media && media.dataset.playbackId === playback?.playbackId
			? Math.max(0, media.currentTime - Number(media.dataset.start ?? 0)) * 1000
			: playback
				? getPlaybackPosition(playback, now)
				: 0
	const progress = `${formatTime(position)}/${formatTime(song?.durationMs ?? 0)}`

	useEffect(() => {
		setNow(Date.now())
		if (!song || !active) return
		const timer = setInterval(() => setNow(Date.now()), 1000)
		return () => clearInterval(timer)
	}, [active, playback?.playbackId, playback?.positionMs, playback?.receivedAt, song])

	return (
		<section className="pointer-events-none fixed inset-0 z-1 h-svh w-full overflow-hidden" aria-label="音频可视化">
			<ChorusBackdrop />
			<canvas ref={topRef} className={`top-0 ${edgeClassName}`} aria-hidden="true" />
			<SongTitle song={song} />

			<div className="absolute top-1/2 w-full -translate-y-1/2">
				<div
					ref={visualsRef}
					className={
						isMobile
							? 'grid w-full grid-cols-1 items-center'
							: 'grid w-full origin-center grid-cols-[minmax(0,1fr)_min(52vw,72vmin,560px)_minmax(0,1fr)] items-center gap-0.5 px-[clamp(6px,1vw,16px)] will-change-transform'
					}
				>
					{!isMobile && (
						<div className={`${infoClassName} w-full max-w-[clamp(180px,30vw,560px)] justify-self-end -mr-[clamp(8px,5vw,100px)]`}>
							<p className="m-0 truncate uppercase tracking-[0.06em]" title={song?.name ?? '等待电台'}>
								{song?.name ?? '等待电台'}
							</p>
						</div>
					)}

					<div ref={centerRef} className="relative aspect-square w-full origin-center will-change-transform @container">
						<div
							className={`${frameClassName} motion-safe:animate-[cover-frame-spin_24s_linear_infinite] border-white/70 shadow-[0_0_clamp(2px,2.5cqw,12px)_rgba(255,255,255,0.25)]`}
							style={{ animationPlayState }}
							aria-hidden="true"
						/>
						<div
							className={`${frameClassName} rotate-45 motion-safe:animate-[cover-frame-spin_24s_linear_infinite_reverse] border-white/70 shadow-[0_0_clamp(2px,2.5cqw,12px)_rgba(255,255,255,0.25)]`}
							style={{ animationPlayState }}
							aria-hidden="true"
						/>
						<canvas ref={ringRef} className="absolute inset-0 z-10 block size-full" aria-hidden="true" />
						<div
							ref={coverRef}
							className={`absolute top-1/2 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[#101214] shadow-[0_0_0_1px_rgba(217,244,246,0.16),0_12px_32px_rgba(0,0,0,0.35)] ${config.coverClassName}`}
						>
							<img
								ref={imageRef}
								src={song?.picUrl || config.coverSrc}
								alt=""
								className="block size-full object-cover select-none will-change-transform"
								style={{ transform: `rotate(0deg) scale(${config.camera.scale})` }}
								draggable={false}
							/>
						</div>
					</div>

					{!isMobile && (
						<div className={`${infoClassName} w-full max-w-[clamp(180px,30vw,560px)] justify-self-start -ml-[clamp(8px,5vw,100px)]`}>
							<p className="m-0 whitespace-nowrap tabular-nums" aria-label={`播放进度 ${progress}`}>
								{progress}
							</p>
						</div>
					)}
				</div>
			</div>

			<canvas ref={bottomRef} className={`bottom-0 ${edgeClassName}`} aria-hidden="true" />
		</section>
	)
}
