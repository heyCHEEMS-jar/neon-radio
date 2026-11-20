'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { logout } from '@/features/radio/api'
import { useI18n } from '@/i18n/context'

interface LogoutProps {
	onClose: () => void
	onSuccess: () => void
}

export default function Logout({ onClose, onSuccess }: LogoutProps) {
	const { t } = useI18n()
	const [loggingOut, setLoggingOut] = useState(false)
	const pending = useRef(false)
	const requestRef = useRef<AbortController | null>(null)

	useEffect(() => () => requestRef.current?.abort(), [])

	// 服务端退出成功后才更新登录状态，重复点击不重复提交
	const handleLogout = async () => {
		if (pending.current) return
		pending.current = true
		const controller = new AbortController()
		requestRef.current = controller
		setLoggingOut(true)
		try {
			await logout(controller.signal)
			if (!controller.signal.aborted) onSuccess()
		} catch {
			if (!controller.signal.aborted) toast.error(t('login.logoutFailed'))
		} finally {
			pending.current = false
			if (!controller.signal.aborted) setLoggingOut(false)
		}
	}

	return (
		<Dialog
			open
			onOpenChange={open => {
				if (!open && !pending.current) onClose()
			}}
		>
			<DialogContent role="alertdialog" showCloseButton={false}>
				<DialogTitle>{t('login.logoutTitle')}</DialogTitle>
				<DialogDescription>{t('login.logoutDescription')}</DialogDescription>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						disabled={loggingOut}
						onClick={() => {
							if (!pending.current) onClose()
						}}
						className="cursor-pointer rounded-md border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{t('common.cancel')}
					</button>
					<button
						type="button"
						disabled={loggingOut}
						onClick={handleLogout}
						className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loggingOut ? t('login.loggingOut') : t('login.confirmLogout')}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
