'use client'

import { visualizerConfig as config } from '@/config/visualizer'
import { useVisualizer } from '@/hooks/visualizer/useVisualizer'

const edgeClassName =
	'absolute left-0 block h-[clamp(48px,10svh,96px)] w-full opacity-70 [mask-image:linear-gradient(to_right,transparent,#000_16%,#000_84%,transparent)]'

const infoClassName =
	'min-w-0 translate-y-1/2 border-t-[clamp(2px,0.3vw,5px)] border-white/70 pt-[clamp(6px,0.8vw,12px)] text-center text-[clamp(10px,2.4vw,40px)] font-light text-[#e6cbd6] [text-shadow:0_2px_12px_rgba(0,0,0,0.65)]'

const frameClassName =
	'absolute top-1/2 left-1/2 aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 border-[5px]'

export default function Visuals() {
	const { ringRef, coverRef, imageRef, topRef, bottomRef } = useVisualizer()

	return (
		<section className="pointer-events-none fixed inset-0 z-1 h-svh w-full overflow-hidden" aria-label="音频可视化（模拟频谱）">
			<canvas ref={topRef} className={`top-0 ${edgeClassName}`} aria-hidden="true" />

			<div className="absolute top-1/2 grid w-full -translate-y-1/2 grid-cols-[minmax(0,1fr)_min(44vw,64vmin,480px)_minmax(0,1fr)] items-center gap-[clamp(8px,2vw,32px)] px-[clamp(16px,3vw,48px)]">
				<div className={infoClassName}>
					<p className="m-0 truncate uppercase tracking-[0.06em]" title={config.songName}>
						{config.songName}
					</p>
				</div>

				<div className="relative aspect-square w-full">
					<div
						className={`${frameClassName} motion-safe:animate-[cover-frame-spin_24s_linear_infinite] border-white/70 shadow-[0_0_12px_rgba(255,255,255,0.25)]`}
						aria-hidden="true"
					/>
					<div
						className={`${frameClassName} rotate-45 motion-safe:animate-[cover-frame-spin_24s_linear_infinite_reverse] border-white/70 shadow-[0_0_12px_rgba(255,255,255,0.25)]`}
						aria-hidden="true"
					/>
					<canvas ref={ringRef} className="absolute inset-0 z-10 block size-full" aria-hidden="true" />
					<div
						ref={coverRef}
						className={`absolute top-1/2 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full bg-[#101214] shadow-[0_0_0_1px_rgba(217,244,246,0.16),0_12px_32px_rgba(0,0,0,0.35)] ${config.coverClassName}`}
					>
						<img
							ref={imageRef}
							src={config.coverSrc}
							alt=""
							className="block size-full object-cover select-none will-change-transform"
							style={{ transform: `scale(${config.camera.scale})` }}
							draggable={false}
						/>
					</div>
				</div>

				<div className={infoClassName}>
					<p className="m-0 whitespace-nowrap tabular-nums" aria-label={`播放进度 ${config.playbackProgress}`}>
						{config.playbackProgress}
					</p>
				</div>
			</div>

			<canvas ref={bottomRef} className={`bottom-0 ${edgeClassName}`} aria-hidden="true" />
		</section>
	)
}
