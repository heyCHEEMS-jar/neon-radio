'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface LogoutProps {
	onClose: () => void
	onSuccess: () => void
}

export default function Logout({ onClose, onSuccess }: LogoutProps) {
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
			const response = await fetch('/neon-radio/login', { method: 'DELETE', cache: 'no-store', signal: controller.signal })
			if (!response.ok) throw new Error('退出失败')
			if (!controller.signal.aborted) onSuccess()
		} catch {
			if (!controller.signal.aborted) toast.error('退出登录失败，请重试')
		} finally {
			pending.current = false
			if (!controller.signal.aborted) setLoggingOut(false)
		}
	}

	return (
		<Dialog open onOpenChange={open => { if (!open && !pending.current) onClose() }}>
			<DialogContent role="alertdialog" showCloseButton={false}>
				<DialogTitle>退出登录</DialogTitle>
				<DialogDescription>确定要退出登录吗？退出后需要重新扫码登录电台。</DialogDescription>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						disabled={loggingOut}
						onClick={() => { if (!pending.current) onClose() }}
						className="cursor-pointer rounded-md border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
					>
						取消
					</button>
					<button
						type="button"
						disabled={loggingOut}
						onClick={handleLogout}
						className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
					>
						{loggingOut ? '正在退出…' : '确认退出'}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
