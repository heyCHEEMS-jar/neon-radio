'use client'

import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Compass, LogIn, LogOut, RadioTower, Settings2, Waves } from 'lucide-react'
import { toast } from 'sonner'
import { isSceneMotionEnabled, sceneMotionStorageKey, setSceneMotionEnabled } from '@/audio'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { fetchLoginStatus } from '@/features/radio/api'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'
import { useI18n } from '@/i18n/context'
import type { StringKey } from '@/i18n/locales'
import type { MenuPosition } from '../Radio'

const Login = lazy(() => import('./Login'))
const Options = lazy(() => import('./Options'))
const Logout = lazy(() => import('./Logout'))

type LoginStatus = 'checking' | 'authenticated' | 'anonymous' | 'error'

interface MenuProps {
	position: MenuPosition
	onOpenRoaming: () => void
	onRestoreFocus: () => void
}

const menuLabels: Record<LoginStatus, StringKey> = {
	checking: 'menu.checking',
	authenticated: 'menu.logout',
	anonymous: 'menu.login',
	error: 'menu.check'
}

export default function Menu({ position, onOpenRoaming, onRestoreFocus }: MenuProps) {
	const { t } = useI18n()
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error(t('menu.outsideLive'))
	const { reauthenticate } = live
	const [dialog, setDialog] = useState<'login' | 'options' | 'logout' | null>(null)
	const [sceneMotion, setSceneMotion] = useState(isSceneMotionEnabled)
	const [status, setStatus] = useState<LoginStatus>('checking')
	const [errorMessage, setErrorMessage] = useState('')
	const triggerRef = useRef<HTMLSpanElement>(null)
	const statusRequest = useRef<AbortController | null>(null)

	// 查询登录状态，失败时允许手动重试
	const checkLogin = useCallback(async () => {
		statusRequest.current?.abort()
		const controller = new AbortController()
		statusRequest.current = controller
		setStatus('checking')
		setErrorMessage('')
		try {
			const loggedIn = await fetchLoginStatus(controller.signal)
			if (!controller.signal.aborted) setStatus(loggedIn ? 'authenticated' : 'anonymous')
		} catch {
			if (controller.signal.aborted) return
			const message = t('menu.loginFailed')
			setStatus('error')
			setErrorMessage(message)
			toast.error(message)
		}
	}, [t])

	// 异步导入后在原点击位置打开菜单，首屏内容保持挂载
	useEffect(() => {
		triggerRef.current?.dispatchEvent(
			new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				button: 2,
				clientX: position.x,
				clientY: position.y
			})
		)
	}, [position])

	// 首次加载检查一次，关闭和重开菜单不再查询
	useEffect(() => {
		checkLogin()
		return () => statusRequest.current?.abort()
	}, [checkLogin])

	const handleLoginSuccess = useCallback(() => {
		statusRequest.current?.abort()
		setStatus('authenticated')
		setErrorMessage('')
		setDialog(null)
		reauthenticate()
		toast.success(t('menu.loginSuccess'))
	}, [reauthenticate, t])

	const handleLogoutSuccess = () => {
		statusRequest.current?.abort()
		setStatus('anonymous')
		setErrorMessage('')
		setDialog(null)
		reauthenticate()
		toast.success(t('menu.logoutSuccess'))
	}

	return (
		<>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<span ref={triggerRef} aria-hidden="true" className="hidden" />
				</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={event => {
						event.preventDefault()
						if (!dialog) onRestoreFocus()
					}}
				>
					{live.playback?.mode === 'local' && !live.playbackPending && (
						<ContextMenuItem onSelect={() => void live.returnToMain()}>
							<RadioTower className="size-4" />
							{t('menu.toMain')}
						</ContextMenuItem>
					)}
					<ContextMenuItem onSelect={onOpenRoaming}>
						<Compass className="size-4" />
						{t('menu.roaming')}
					</ContextMenuItem>
					<ContextMenuItem
						onSelect={() => {
							const next = !sceneMotion
							setSceneMotionEnabled(next)
							setSceneMotion(next)
							try {
								localStorage.setItem(sceneMotionStorageKey, next ? 'on' : 'off')
							} catch {
								toast.warning(t('menu.motionSaveFailed'))
							}
						}}
					>
						<Waves className="size-4" />
						{sceneMotion ? t('menu.motionOff') : t('menu.motionOn')}
					</ContextMenuItem>
					{status === 'authenticated' && (
						<ContextMenuItem onSelect={() => setDialog('options')}>
							<Settings2 className="size-4" />
							{t('menu.options')}
						</ContextMenuItem>
					)}
					<ContextMenuItem
						disabled={status === 'checking'}
						onSelect={async () => {
							if (status === 'error') await checkLogin()
							else setDialog(status === 'authenticated' ? 'logout' : 'login')
						}}
					>
						{status === 'authenticated' ? <LogOut className="size-4" /> : <LogIn className="size-4" />}
						{t(menuLabels[status])}
					</ContextMenuItem>
					{errorMessage && (
						<ContextMenuItem disabled className="max-w-64 whitespace-normal text-xs">
							{errorMessage}
						</ContextMenuItem>
					)}
				</ContextMenuContent>
			</ContextMenu>
			<Suspense fallback={null}>
				{dialog === 'login' && <Login onClose={() => setDialog(null)} onSuccess={handleLoginSuccess} />}
				{dialog === 'options' && <Options onClose={() => setDialog(null)} />}
				{dialog === 'logout' && <Logout onClose={() => setDialog(null)} onSuccess={handleLogoutSuccess} />}
			</Suspense>
		</>
	)
}
