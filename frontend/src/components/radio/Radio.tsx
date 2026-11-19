'use client'

import { createContext, lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import useRadioLive, { RadioLiveContext } from '@/hooks/useRadioLive'
import useRadioAudio, { RadioAudioContext } from '@/hooks/useRadioAudio'
import Player from './Player'
import type { RoamingProps } from './Roaming'

const Menu = lazy(() => import('./Menu'))
const Roaming = lazy(() => import('./Roaming').catch(() => ({ default: LoadError })))

export const RadioSceneContext = createContext(true)

export interface MenuPosition {
	x: number
	y: number
}

// 漫游代码加载失败时保留关闭入口
function LoadError({ open, onClose }: RoamingProps) {
	return open ? (
		<button type="button" onClick={onClose} className="fixed left-4 top-4 z-50 rounded-lg bg-black/70 p-3 text-sm text-white">
			漫游加载失败，请刷新并重试
		</button>
	) : null
}

// 电台宿主保留唯一的 WS 和音频实例，界面切换只控制视觉和交互
export default function Radio({ children }: { children: ReactNode }) {
	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null) // 右键菜单的屏幕位置
	const [roamingPhase, setRoamingPhase] = useState<'closed' | 'entering' | 'open'>('closed') // 入场结束后再隐藏主界面
	const roaming = roamingPhase !== 'closed' // 入场和打开阶段都暂停主界面视觉
	const audioRef = useRef<HTMLAudioElement>(null) // 整个电台共用的媒体元素，漫游和重连不替换
	const live = useRadioLive(roaming, audioRef) // WS 管理歌曲、模式和同步权限
	const audio = useRadioAudio(live, audioRef) // 音频管线管理真实播放和频谱
	const rootRef = useRef<HTMLDivElement>(null) // 漫游关闭后归还键盘焦点
	const wasRoaming = useRef(false) // 判断本次是否刚从漫游退出

	// 主界面恢复可见后再交还焦点
	useLayoutEffect(() => {
		if (!roaming && wasRoaming.current) rootRef.current?.focus()
		wasRoaming.current = roaming
	}, [roaming])

	// 打开漫游后先播放入场动画，不重建音频和实时连接
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
			if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(preload, { timeout: 1500 })
			else preload()
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
			<RadioAudioContext.Provider value={audio}>
				<audio ref={audioRef} preload="metadata" crossOrigin="anonymous" className="hidden" aria-hidden="true" />
				<div
					ref={rootRef}
					tabIndex={0}
					inert={roaming || !audio.started}
					aria-hidden={roaming || !audio.started}
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
					<RadioSceneContext.Provider value={!roaming && audio.playing}>
						<div style={{ visibility: roamingPhase === 'open' ? 'hidden' : 'visible' }}>{children}</div>
					</RadioSceneContext.Provider>
				</div>
				<Player visible={!roaming} />
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
			</RadioAudioContext.Provider>
		</RadioLiveContext.Provider>
	)
}
