'use client'

import { useContext, useEffect, useState } from 'react'
import { Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import type { PlaybackOrder } from '@neon-radio/protocol'
import { RadioAudioContext } from '@/audio'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'

const playbackModes: Record<PlaybackOrder, { label: string; icon: typeof Repeat; next: PlaybackOrder }> = {
	single: { label: '单曲循环', icon: Repeat1, next: 'random' },
	random: { label: '随机播放', icon: Shuffle, next: 'sequential' },
	sequential: { label: '顺序播放', icon: Repeat, next: 'single' }
}

const controlClassName =
	'grid size-7 shrink-0 cursor-pointer place-items-center rounded-full enabled:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-40'

// 紧凑播放器展示前后切歌、播放进度与游客本地模式，首次居中，点击后过渡到屏幕下方
export default function Player({ visible }: { visible: boolean }) {
	const audio = useContext(RadioAudioContext) // 音频播放、加载和首次进入状态
	const live = useContext(RadioLiveContext) // 当前歌曲以及服务端拖动权限
	if (!audio || !live) throw new Error('播放器需要放在电台音频管线内')
	const [position, setPosition] = useState(0) // 媒体实际播放位置，单位秒
	const [draft, setDraft] = useState<number | null>(null) // 拖动中的预览位置，松手才提交 WS
	const duration = Math.max(0, audio.range.end - audio.range.start) // 只展示实际可播时长，试听不沿用整曲时长
	const toggle = audio.toggle
	const toggleDisabled = audio.loading && !audio.started
	const playbackMode = playbackModes[live.localPlaybackOrder]
	const PlaybackModeIcon = playbackMode.icon
	const modeTitle = live.authenticated
		? '本地播放偏好仅用于游客自漫游，不影响管理员播放'
		: `${playbackMode.label} · 仅对游客本地漫游生效，主电台不受影响`
	const canChangeSong =
		audio.started &&
		!audio.loading &&
		Boolean(live.playback?.song) &&
		live.status === 'ready' &&
		!live.playbackPending &&
		(live.authenticated || Boolean(live.options?.guestRoamingEnabled))
	const canPlayNext = canChangeSong && Boolean(live.songs?.some(song => Number.isFinite(song.durationMs) && song.durationMs > 0))
	const canSeek =
		duration > 0 &&
		audio.started &&
		Boolean(live.playback?.song) &&
		live.status === 'ready' &&
		!live.playbackPending &&
		(live.authenticated || Boolean(live.options?.guestRoamingEnabled)) // 游客关闭漫游时禁用拖动

	// 进度刷新只重绘播放器，进入漫游或暂停后停止定时刷新
	useEffect(() => {
		const media = audio.audioRef.current // 在挂载后读取，首次 render 时 ref 可能尚未绑定
		if (!media || !visible) return
		const update = () => setPosition(Math.max(0, Math.min(duration, media.currentTime - audio.range.start))) // 试听从自身可播区间的 0 开始显示
		update()
		setDraft(null)
		media.addEventListener('loadedmetadata', update)
		media.addEventListener('seeked', update)
		media.addEventListener('emptied', update)
		const timer = audio.playing ? setInterval(update, 250) : null // 播放时每秒四次，避免另开 RAF
		return () => {
			media.removeEventListener('loadedmetadata', update)
			media.removeEventListener('seeked', update)
			media.removeEventListener('emptied', update)
			if (timer) clearInterval(timer)
		}
	}, [audio.audioRef, audio.playing, audio.range.start, duration, live.playback?.playbackId, visible])

	// 播放器可见时支持空格切换，保留输入和控件的原生键盘行为
	useEffect(() => {
		if (!visible) return
		const onKeyDown = (event: KeyboardEvent) => {
			if (
				event.code !== 'Space' ||
				event.defaultPrevented ||
				event.isComposing ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey
			) return
			const target = event.target
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable || target.closest('input, textarea, select, button, a, [role="button"]'))
			) return
			// 阻止页面滚动，按住空格只切换一次，并遵循播放按钮的禁用状态
			event.preventDefault()
			if (!event.repeat && !toggleDisabled) toggle()
		}
		window.addEventListener('keydown', onKeyDown)
		return () => window.removeEventListener('keydown', onKeyDown)
	}, [toggle, toggleDisabled, visible])

	// 松手或键盘调整结束后提交一次，由服务端决定进入本地还是同步主线
	const commit = (value: number) => {
		if (!canSeek || draft === null) return
		void live.seek(value * 1000).then(() => setDraft(null))
	}

	if (!visible) return null
	return (
		<>
			{!audio.started && <div className="fixed inset-0 z-30 bg-black/10 backdrop-blur-md" aria-hidden="true" />}
			<div
				className="fixed left-1/2 z-40 flex h-10 w-[min(80vw,272px)] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-white/25 bg-neutral-950/90 px-2.5 text-white shadow-xl transition-[top] duration-700 ease-out motion-reduce:transition-none"
				style={{ top: audio.started ? 'calc(100svh - 72px - env(safe-area-inset-bottom))' : '50svh' }}
			>
				<button
					type="button"
					onClick={() => void live.playPrevious()}
					disabled={!canChangeSong || !live.hasPrevious}
					aria-label="上一首"
					title="上一首"
					className={controlClassName}
				>
					<SkipBack className="size-3.5" fill="currentColor" aria-hidden="true" />
				</button>
				<button
					type="button"
					onClick={toggle}
					disabled={toggleDisabled}
					aria-keyshortcuts="Space"
					aria-label={audio.playing ? '暂停' : '播放'}
					title={audio.error ?? (audio.playing ? '暂停' : '播放')}
					className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-50"
				>
					{audio.loading ? (
						<Spinner className="size-4" />
					) : audio.playing ? (
						<Pause className="size-4" fill="currentColor" />
					) : (
						<Play className="size-4" fill="currentColor" />
					)}
				</button>
				<button
					type="button"
					onClick={() => void live.playNext(true)}
					disabled={!canPlayNext}
					aria-label="下一首"
					title="下一首"
					className={controlClassName}
				>
					<SkipForward className="size-3.5" fill="currentColor" aria-hidden="true" />
				</button>
				<input
					type="range"
					min={0}
					max={Math.max(1, duration)}
					step={0.1}
					value={Math.min(duration, draft ?? position)}
					disabled={!canSeek}
					aria-label="播放进度"
					className="m-0 h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full disabled:cursor-default
						focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-white focus-visible:outline-offset-6
						[&::-webkit-slider-thumb]:size-2 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
						[&::-moz-range-thumb]:size-2 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white
						[&:disabled::-webkit-slider-thumb]:opacity-0 [&:disabled::-moz-range-thumb]:opacity-0"
					style={{ background: `linear-gradient(to right, #fff ${duration ? ((draft ?? position) / duration) * 100 : 0}%, #ffffff30 0)` }}
					onChange={event => setDraft(event.currentTarget.valueAsNumber)}
					onPointerUp={event => commit(event.currentTarget.valueAsNumber)}
					onPointerCancel={() => setDraft(null)}
					onKeyUp={event => {
						if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key))
							commit(event.currentTarget.valueAsNumber)
					}}
				/>
				<button
					type="button"
					disabled={!audio.started || live.authenticated}
					onClick={() => live.setLocalPlaybackOrder(playbackMode.next)}
					aria-label={`游客本地播放模式：${playbackMode.label}，点击切换为${playbackModes[playbackMode.next].label}`}
					title={!audio.started ? '请先点击播放，再切换本地播放模式' : modeTitle}
					className={controlClassName}
				>
					<PlaybackModeIcon className="pointer-events-none size-3.5" aria-hidden="true" />
				</button>
			</div>
		</>
	)
}
