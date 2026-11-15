'use client'

import { useState, type ReactNode } from 'react'
import { LogIn } from 'lucide-react'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import LoginForm from './QRCode'

export default function RadioMenu({ children }: { children: ReactNode }) {
	const [loginOpen, setLoginOpen] = useState(false)

	return (
		<Dialog open={loginOpen} onOpenChange={setLoginOpen}>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<div tabIndex={0} className="min-h-svh select-none [-webkit-touch-callout:none]">
						{children}
					</div>
				</ContextMenuTrigger>
				<ContextMenuContent
					onCloseAutoFocus={event => {
						if (loginOpen) event.preventDefault()
					}}
				>
					<ContextMenuItem onSelect={() => setLoginOpen(true)}>
						<LogIn className="size-4" />
						登录电台
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<DialogContent showCloseButton={false} aria-describedby={undefined}>
				<DialogTitle className="sr-only">登录电台</DialogTitle>
				<LoginForm />
			</DialogContent>
		</Dialog>
	)
}
