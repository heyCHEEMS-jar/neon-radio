'use client'

import { useLayoutEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import DraggableGrid from '@/components/originkit/ui/DraggableGrid'

export interface RoamingProps {
	open: boolean
	onClose: () => void
	onEntered?: () => void
}

export default function Roaming({ open, onClose, onEntered }: RoamingProps) {
	const dialogRef = useRef<HTMLDialogElement>(null)
	const reducedMotion = useReducedMotion()

	// 打开前同步切换弹窗，隐藏时保留网格并交还背景焦点
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
			<DraggableGrid
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
