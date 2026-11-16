'use client'

import { createContext, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import useRadioLive, { RadioLiveContext } from '@/hooks/useRadioLive'
import type { RoamingProps } from './Roaming'

const Menu = lazy(() => import('./Menu'))
const Roaming = lazy(() => import('./Roaming').catch(() => ({ default: LoadError })))

export const RadioSceneContext = createContext(true)

export interface MenuPosition {
	x: number
	y: number
}

function LoadError({ open, onClose }: RoamingProps) {
	return open ? (
		<button type="button" onClick={onClose} className="fixed left-4 top-4 z-50 rounded-lg bg-black/70 p-3 text-sm text-white">
			漫游加载失败，点击关闭后刷新重试
		</button>
	) : null
}

export default function Radio({ children }: { children: ReactNode }) {
	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null)
	// 入场期间保留静止底图，面板覆盖屏幕后再隐藏
	const [roamingPhase, setRoamingPhase] = useState<'closed' | 'entering' | 'open'>('closed')
	const roaming = roamingPhase !== 'closed'
	const live = useRadioLive(roaming)
	const rootRef = useRef<HTMLDivElement>(null)
	const wasRoaming = useRef(false)

	// 主界面恢复可见后再交还焦点
	useLayoutEffect(() => {
		if (!roaming && wasRoaming.current) rootRef.current?.focus()
		wasRoaming.current = roaming
	}, [roaming])

	const openRoaming = () => {
		if (roaming) return
		setRoamingPhase('entering')
	}

	// 页面加载后空闲预载组件代码，不挂载界面；预载失败留给打开时处理
	useEffect(() => {
		let idleId: number | undefined
		const preload = () => {
			void import('./Roaming').catch(() => {})
		}
		const schedulePreload = () => {
			if (typeof window.requestIdleCallback === 'function') {
				idleId = window.requestIdleCallback(preload, { timeout: 1500 })
			} else preload()
		}
		if (document.readyState === 'complete') schedulePreload()
		else window.addEventListener('load', schedulePreload, { once: true })
		return () => {
			window.removeEventListener('load', schedulePreload)
			if (idleId !== undefined) window.cancelIdleCallback(idleId)
		}
	}, [])

	return (
		<RadioLiveContext.Provider value={live}>
			<div
				ref={rootRef}
				tabIndex={0}
				inert={roaming}
				aria-hidden={roaming}
				className="min-h-svh select-none [-webkit-touch-callout:none]"
				style={{ backgroundColor: roaming ? '#fff' : undefined }}
				onContextMenu={event => {
					event.preventDefault()
					setMenuPosition({ x: event.clientX, y: event.clientY })
				}}
				onWheel={event => {
					if (event.deltaY > 0 && !event.ctrlKey && !roaming) openRoaming()
				}}
			>
				<RadioSceneContext.Provider value={!roaming}>
					<div style={{ visibility: roamingPhase === 'open' ? 'hidden' : 'visible' }}>{children}</div>
				</RadioSceneContext.Provider>
			</div>
			<Suspense fallback={null}>
				{menuPosition && <Menu position={menuPosition} onOpenRoaming={openRoaming} onRestoreFocus={() => rootRef.current?.focus()} />}
			</Suspense>
			<Suspense fallback={null}>
				{roaming && (
					<Roaming
						open={roaming}
						onClose={() => setRoamingPhase('closed')}
						onEntered={() => setRoamingPhase(phase => (phase === 'entering' ? 'open' : phase))}
					/>
				)}
			</Suspense>
			<Toaster richColors closeButton />
		</RadioLiveContext.Provider>
	)
}
