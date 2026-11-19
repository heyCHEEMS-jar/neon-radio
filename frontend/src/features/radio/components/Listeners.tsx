'use client'

import { useContext, useState } from 'react'
import { Headphones } from 'lucide-react'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'

// 左下角显示电台在线人数，悬停展开在听人数最多的前 10 首歌
export default function Listeners({ visible }: { visible: boolean }) {
	const live = useContext(RadioLiveContext)
	const [hovered, setHovered] = useState(false)
	const listeners = live?.listeners
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
			className="fixed bottom-[calc(16px+env(safe-area-inset-bottom))] left-4 z-40 flex flex-col items-start gap-2 text-white"
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
		>
			{hovered && (
				<div className="w-56 rounded-xl bg-black/45 p-3 shadow-xl">
					<p className="m-0 mb-2 flex items-center justify-between text-xs text-white/60">
						<span>在线</span>
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
						<p className="m-0 text-xs text-white/55">暂时没有人在听</p>
					)}
				</div>
			)}
			<p className="m-0 flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-xs text-white/70">
				<Headphones className="size-3.5" aria-hidden="true" />
				<span className="tabular-nums">{listeners.online}</span>
				<span className="sr-only">人在线，悬停查看每首歌的在听人数</span>
			</p>
		</div>
	)
}
