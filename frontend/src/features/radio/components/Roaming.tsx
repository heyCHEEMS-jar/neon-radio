'use client'

import { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { RadioTower, X } from 'lucide-react'
import DraggableGrid from '@/components/vendor/originkit/ui/DraggableGrid'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'
import { useI18n } from '@/i18n/context'

export interface RoamingProps {
	open: boolean
	onClose: () => void
	onEntered?: () => void
}

// 统一大小写、全角半角和标点
function normalizeSearch(value: string) {
	return value
		.normalize('NFKC')
		.toLowerCase()
		.replace(/[\s'’"“”·・.,，。!！?？:：;；()（）[\]【】{}<>《》/\|_-]+/g, '')
}

export default function Roaming({ open, onClose, onEntered }: RoamingProps) {
	const { t } = useI18n()
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error(t('roaming.outsideLive'))
	const dialogRef = useRef<HTMLDialogElement>(null)
	const initialSongId = useRef(live.playback?.song?.id ?? null)
	const [focus, setFocus] = useState<{ id: string; request: number } | null>(null)
	const [query, setQuery] = useState('')
	const reducedMotion = useReducedMotion()
	// 列表未变化时保持网格引用，避免播放状态刷新重置拖动位置
	const items = useMemo(
		() =>
			live.songs?.map(({ id, name, artists, picUrl, durationMs }) => ({
				id,
				name,
				artists,
				duration: durationMs,
				image: { src: picUrl }
			})) ?? null,
		[live.songs]
	)
	const currentSong = live.playback?.song ?? null
	// 搜索只用于在网格中定位，不触发播放；歌名和歌手合并后做子串匹配
	const searchIndex = useMemo(
		() =>
			(live.songs ?? []).map(song => ({
				song,
				text: normalizeSearch(`${song.name} ${song.artists.join(' ')}`)
			})),
		[live.songs]
	)
	const results = useMemo(() => {
		const keyword = normalizeSearch(query)
		if (!keyword) return []
		return searchIndex
			.filter(entry => entry.text.includes(keyword))
			.slice(0, 12)
			.map(entry => entry.song)
	}, [query, searchIndex])

	const jumpTo = (songId: string) => {
		setFocus(previous => ({ id: songId, request: (previous?.request ?? 0) + 1 }))
		setQuery('')
	}

	// 挂载时同步打开弹窗，关闭后由父组件卸载并恢复焦点
	useLayoutEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return
		if (open && !dialog.open) dialog.showModal()
		else if (!open && dialog.open) dialog.close()
	}, [open])

	return (
		<dialog
			ref={dialogRef}
			inert={!open}
			aria-hidden={!open}
			aria-labelledby="roaming-title"
			aria-describedby="roaming-description"
			onClose={onClose}
			className="fixed inset-0 m-0 block h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 text-white backdrop:bg-transparent [&:not([open])]:invisible [&:not([open])]:pointer-events-none"
		>
			<header className="absolute left-4 top-4 z-20 flex max-w-[calc(100%-5rem)] items-center gap-2 rounded-xl bg-black/60 px-3 py-2.5">
				<h2 id="roaming-title" className="sr-only">
					{t('roaming.title')}
				</h2>
				<p id="roaming-description" className="sr-only">
					{t('roaming.description')}
				</p>
				<div className="relative w-full min-w-0 max-w-50">
					<Input
						value={query}
						onChange={event => setQuery(event.currentTarget.value)}
						onKeyDown={event => {
							if (event.key === 'Enter' && results[0]) jumpTo(results[0].id)
						}}
						placeholder={t('roaming.searchPlaceholder')}
						aria-label={t('roaming.searchLabel')}
						className="h-9 border-white/20 bg-white/95 text-sm text-zinc-900 placeholder:text-zinc-500"
					/>
					{query.trim() && (
						<div className="absolute left-0 top-full z-30 mt-2 max-h-[50vh] w-full overflow-auto rounded-lg border border-zinc-200 bg-white p-1 text-zinc-900 shadow-xl">
							{results.length ? (
								results.map(song => (
									<button
										key={song.id}
										type="button"
										onClick={() => jumpTo(song.id)}
										className="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-zinc-100"
									>
										<span className="block truncate text-sm">{song.name}</span>
										<span className="block truncate text-xs text-zinc-500">{song.artists.join(' / ')}</span>
									</button>
								))
							) : (
								<p className="px-3 py-2 text-sm text-zinc-500">{t('roaming.noMatch')}</p>
							)}
						</div>
					)}
				</div>
				<button
					type="button"
					disabled={live.playback?.mode === 'main' || live.playbackPending}
					onClick={() => {
						void live.returnToMain().then(success => {
							if (success) onClose()
						})
					}}
					className="flex shrink-0 cursor-pointer items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
				>
					<RadioTower className="size-4" />
					{t('menu.toMain')}
				</button>
			</header>
			<motion.div
				initial={{ opacity: 0, z: reducedMotion ? 0 : 600 }}
				animate={{ opacity: open ? 1 : 0, z: open || reducedMotion ? 0 : 600 }}
				transition={{ duration: open && !reducedMotion ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
				style={{ transformPerspective: 1000, transformOrigin: '50% 50%' }}
				onAnimationComplete={() => {
					if (open) onEntered?.()
				}}
				className="absolute inset-0"
			>
			{items === null ? (
				<div className="grid h-full place-items-center text-sm text-neutral-500" role="status">
					{live.status === 'error' ? (
						<button type="button" onClick={live.reconnect} className="cursor-pointer underline underline-offset-4">
							{t('roaming.loadFailedRetry')}
						</button>
					) : (
						<div className="flex flex-col items-center gap-3">
							<Spinner className="size-6" aria-hidden="true" />
							<span>{t('roaming.loading')}</span>
						</div>
					)}
				</div>
			) : items.length === 0 ? (
				<div className="grid h-full place-items-center text-sm text-neutral-500" role="status">
					{t('roaming.empty')}
				</div>
			) : (
				<DraggableGrid
					items={items}
					initialItemId={initialSongId.current}
					focusItemId={focus?.id ?? null}
					focusRequest={focus?.request ?? 0}
					activeItemId={currentSong?.id ?? null}
					onItemClick={item => {
						if (!item.id) return
						// 点歌后立即关闭漫游，播放结果在主界面继续反馈
						if (item.id !== currentSong?.id) void live.playSong(item.id)
						onClose()
					}}
					active={open}
					columns={5}
					overscan={1}
					mobileColumns={3}
					mobileOverscan={1}
					gap={3}
					fitViewport
					tilt
					enableWheel
					style={{ minWidth: 0, minHeight: 0 }}
				/>
			)}
			</motion.div>
			<button
				type="button"
				aria-label={t('roaming.close')}
				onClick={() => dialogRef.current?.close()}
				className="absolute right-4 top-4 z-20 cursor-pointer rounded-full bg-black/60 p-3 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
			>
				<X className="size-5" />
			</button>
		</dialog>
	)
}
