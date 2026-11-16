'use client'

import { useContext, useLayoutEffect, useMemo, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import DraggableGrid from '@/components/originkit/ui/DraggableGrid'
import { Spinner } from '@/components/ui/spinner'
import { RadioLiveContext } from '@/hooks/useRadioLive'

export interface RoamingProps {
	open: boolean
	onClose: () => void
	onEntered?: () => void
}

export default function Roaming({ open, onClose, onEntered }: RoamingProps) {
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error('漫游需要放在电台实时管线内')
	const dialogRef = useRef<HTMLDialogElement>(null)
	const reducedMotion = useReducedMotion()
	// 列表未变化时保持网格引用，避免连接状态或弹窗变化重置拖动位置
	const items = useMemo(
		() =>
			live.songs?.map(({ id, name, artists, picUrl, duration }) => ({
				id,
				name,
				artists,
				duration,
				image: { src: picUrl }
			})) ?? null,
		[live.songs]
	)

	// 挂载时同步打开弹窗，关闭后由父组件卸载并恢复焦点
	useLayoutEffect(() => {
		const dialog = dialogRef.current
		if (!dialog) return
		if (open && !dialog.open) dialog.showModal()
		else if (!open && dialog.open) dialog.close()
	}, [open])

	return (
		<motion.dialog
			ref={dialogRef}
			inert={!open}
			aria-hidden={!open}
			aria-labelledby="roaming-title"
			aria-describedby="roaming-description"
			onClose={onClose}
			initial={{ opacity: 0, y: 0, z: reducedMotion ? 0 : 600 }}
			animate={{ opacity: open ? 1 : 0, y: 0, z: open || reducedMotion ? 0 : 600 }}
			transition={{ duration: open && !reducedMotion ? 0.5 : 0, ease: [0.22, 1, 0.36, 1] }}
			style={{ transformPerspective: 1000, transformOrigin: '50% 50%' }}
			onAnimationComplete={() => {
				if (open) onEntered?.()
			}}
			className="fixed inset-0 m-0 block h-dvh max-h-none w-full max-w-none overflow-hidden border-0 bg-white p-0 text-white backdrop:bg-transparent [&:not([open])]:invisible [&:not([open])]:pointer-events-none"
		>
			<header className="pointer-events-none absolute left-4 top-4 z-20 flex max-w-[calc(100%-5rem)] flex-col gap-2 rounded-xl bg-black/60 px-4 py-3">
				<h2 id="roaming-title" className="text-lg font-semibold">
					漫游所有歌曲
				</h2>
				<p id="roaming-description" className="text-sm text-white/70">
					Esc 退出
				</p>
			</header>
			{items === null ? (
				<div className="grid h-full place-items-center text-sm text-neutral-500" role="status">
					{live.status === 'error' ? (
						<button type="button" onClick={live.reconnect} className="cursor-pointer underline underline-offset-4">
							歌曲列表连接失败，点击重试
						</button>
					) : (
						<div className="flex flex-col items-center gap-3">
							<Spinner className="size-6" aria-hidden="true" />
							<span>正在加载歌曲列表…</span>
						</div>
					)}
				</div>
			) : items.length === 0 ? (
				<div className="grid h-full place-items-center text-sm text-neutral-500" role="status">
					暂无歌曲，等待电台同步
				</div>
			) : (
				<DraggableGrid
					items={items}
					active={open}
					columns={5}
					overscan={2}
					mobileColumns={3}
					mobileOverscan={1}
					gap={3}
					fitViewport
					tilt
					enableWheel
					style={{ minWidth: 0, minHeight: 0 }}
				/>
			)}
			<button
				type="button"
				aria-label="关闭漫游"
				onClick={() => dialogRef.current?.close()}
				className="absolute right-4 top-4 z-20 cursor-pointer rounded-full bg-black/60 p-3 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/40"
			>
				<X className="size-5" />
			</button>
		</motion.dialog>
	)
}
