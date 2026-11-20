'use client'

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n/context'
import QRCode from './QRCode'

interface LoginProps {
	onClose: () => void
	onSuccess: () => void
}

export default function Login({ onClose, onSuccess }: LoginProps) {
	const { t } = useI18n()
	return (
		<Dialog
			open
			onOpenChange={open => {
				if (!open) onClose()
			}}
		>
			<DialogContent showCloseButton={false} aria-describedby={undefined}>
				<DialogTitle className="sr-only">{t('login.title')}</DialogTitle>
				<QRCode onSuccess={onSuccess} />
			</DialogContent>
		</Dialog>
	)
}
