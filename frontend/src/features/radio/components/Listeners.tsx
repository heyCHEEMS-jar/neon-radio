'use client'

import { useContext, useEffect, useRef, useState } from 'react'
import { Headphones } from 'lucide-react'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'
import { useI18n } from '@/i18n/context'
import { useMediaQuery } from '@/lib/use-media-query'

// 左下角显示电台在线人数，展开在听人数最多的前 10 首歌；触摸设备点击展开，点击外部收起
export default function Listeners({ visible }: { visible: boolean }) {
	const { t } = useI18n()
	const live = useContext(RadioLiveContext)
	const [expanded, setExpanded] = useState(false) // 或在听人数榜单是否展开
	const rootRef = useRef<HTMLDivElement>(null) // 判断点击是否落在人数组件内
	const canHover = useMediaQuery('(hover: hover) and (pointer: fine)') // 只有能持续悬停的设备才走 hover 交互
	const listeners = live?.listeners

	// 触摸设备展开后，用 pointerdown 提前响应，点中组件外任意位置就收起
	useEffect(() => {
		if (canHover || !expanded) return
		const onPointerDown = (event: PointerEvent) => {
			if (!rootRef.current?.contains(event.target as Node)) setExpanded(false)
		}
		document.addEventListener('pointerdown', onPointerDown)
		return () => document.removeEventListener('pointerdown', onPointerDown)
	}, [canHover, expanded])

	if (!visible || !listeners) return null

	// 服务端只下发歌曲 ID，名称从当前列表里取，已下线歌曲不展示
	const rows = listeners.songs
		.flatMap(({ songId, listeners: count }) => {
			const name = live?.songs?.find(song => song.id === songId)?.name
			return name ? [{ songId, name, count }] : []
		})
		.slice(0, 10)

	return (
		<div
			ref={rootRef}
			className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start gap-2 text-white"
			onMouseEnter={canHover ? () => setExpanded(true) : undefined}
			onMouseLeave={canHover ? () => setExpanded(false) : undefined}
		>
			{expanded && (
				<div className="w-56 rounded-xl bg-black/45 p-3 shadow-xl">
					<p className="m-0 mb-2 flex items-center justify-between text-xs text-white/60">
						<span>{t('listeners.online')}</span>
						<span className="tabular-nums text-white/85">{listeners.online}</span>
					</p>
					{rows.length ? (
						<ul className="m-0 flex list-none flex-col gap-1.5 p-0">
							{rows.map(row => (
								<li key={row.songId} className="flex items-baseline gap-2 text-sm">
									<span className="min-w-0 flex-1 truncate text-white/85">{row.name}</span>
									<span className="shrink-0 tabular-nums text-xs text-white/55">{row.count}</span>
								</li>
							))}
						</ul>
					) : (
						<p className="m-0 text-xs text-white/55">{t('listeners.empty')}</p>
					)}
				</div>
			)}
			<button
				type="button"
				aria-expanded={canHover ? undefined : expanded}
				onClick={canHover ? undefined : () => setExpanded(value => !value)}
				className="m-0 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs text-white/70 focus-visible:outline-2 focus-visible:outline-white"
			>
				<Headphones className="size-3.5" aria-hidden="true" />
				<span className="tabular-nums">{listeners.online}</span>
				<span className="sr-only">{t(canHover ? 'listeners.hintHover' : 'listeners.hintTap')}</span>
			</button>
		</div>
	)
}
