'use client'

import { lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Compass, LogIn, LogOut, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { RadioLiveContext } from '@/hooks/useRadioLive'
import type { MenuPosition } from './Radio'

const Login = lazy(() => import('./Login'))
const Options = lazy(() => import('./Options'))
const Logout = lazy(() => import('./Logout'))

type LoginStatus = 'checking' | 'authenticated' | 'anonymous' | 'error'

interface MenuProps {
	position: MenuPosition
	onOpenRoaming: () => void
	onRestoreFocus: () => void
}

const menuLabels: Record<LoginStatus, string> = {
	checking: '检查登录状态…',
	authenticated: '退出登录',
	anonymous: '登录电台',
	error: '检查登录状态'
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

export default function Menu({ position, onOpenRoaming, onRestoreFocus }: MenuProps) {
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error('电台菜单需要放在电台实时管线内')
	const { reauthenticate } = live
	const [dialog, setDialog] = useState<'login' | 'options' | 'logout' | null>(null)
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
			const response = await fetch('/neon-radio/login', { cache: 'no-store', signal: controller.signal })
			const result: unknown = await response.json()
			if (!response.ok || !isRecord(result) || !isRecord(result.data) || typeof result.data.loggedIn !== 'boolean')
				throw new Error('登录状态检查失败，请重试')
			if (!controller.signal.aborted) setStatus(result.data.loggedIn ? 'authenticated' : 'anonymous')
		} catch {
			if (controller.signal.aborted) return
			const message = '登录状态检查失败，请重试'
			setStatus('error')
			setErrorMessage(message)
			toast.error(message)
		}
	}, [])

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
		toast.success('登录成功')
	}, [reauthenticate])

	const handleLogoutSuccess = () => {
		statusRequest.current?.abort()
		setStatus('anonymous')
		setErrorMessage('')
		setDialog(null)
		reauthenticate()
		toast.success('退出登录成功')
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
					<ContextMenuItem onSelect={onOpenRoaming}>
						<Compass className="size-4" />
						漫游所有歌曲
					</ContextMenuItem>
					{status === 'authenticated' && (
						<ContextMenuItem onSelect={() => setDialog('options')}>
							<Settings2 className="size-4" />
							电台选项
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
						{menuLabels[status]}
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
