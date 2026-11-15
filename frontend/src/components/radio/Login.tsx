'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import QRCode from './QRCode'

interface LoginProps {
	onClose: () => void
	onSuccess: () => void
}

export default function Login({ onClose, onSuccess }: LoginProps) {
	return (
		<Dialog open onOpenChange={open => { if (!open) onClose() }}>
			<DialogContent showCloseButton={false} aria-describedby={undefined}>
				<DialogTitle className="sr-only">登录电台</DialogTitle>
				<QRCode onSuccess={onSuccess} />
			</DialogContent>
		</Dialog>
	)
}
