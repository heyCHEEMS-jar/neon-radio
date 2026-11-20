'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { checkLoginQr, createLoginQr, type LoginQr } from '@/features/radio/api'
import { useI18n } from '@/i18n/context'
import { ApiError } from '@/lib/api-error'
import { debounce } from '@/lib/debounce'

const pollInterval = 2_000

export default function QRCode({ onSuccess }: { onSuccess: () => void }) {
	const { t, serverMessage } = useI18n()
	const [qr, setQr] = useState<LoginQr | null>(null)
	const [attempt, setAttempt] = useState(0)
	const [busy, setBusy] = useState(true)
	const [message, setMessage] = useState(t('qr.generating'))
	const generatingRef = useRef(true)
	const generateQr = useMemo(
		() =>
			debounce(() => {
				if (generatingRef.current) return
				generatingRef.current = true
				setBusy(true)
				setAttempt(value => value + 1)
			}, 300),
		[]
	)

	const handleGenerate = () => {
		if (!generatingRef.current) generateQr()
	}

	useEffect(() => {
		const controller = new AbortController()
		let timer: ReturnType<typeof setTimeout> | undefined

		const showError = (error: unknown) => {
			if (controller.signal.aborted) return
			const errorMessage = error instanceof ApiError ? serverMessage(error.serverMessage) : t('qr.generateFailed')
			setMessage(errorMessage)
			setQr(null)
			toast.error(errorMessage)
		}

		const poll = async (key: string) => {
			try {
				const result = await checkLoginQr(key, controller.signal)
				if (controller.signal.aborted) return
				setMessage(result.message ? serverMessage(result.message) : t('qr.fallbackScan'))
				if (result.code === 803) {
					setQr(null)
					onSuccess()
					return
				}
				if (result.code === 800) setQr(null)
				else timer = setTimeout(() => void poll(key), pollInterval)
			} catch (error: unknown) {
				showError(error)
			}
		}

		const createQr = async () => {
			generatingRef.current = true
			setQr(null)
			setBusy(true)
			setMessage(t('qr.generating'))
			try {
				const data = await createLoginQr(controller.signal)
				if (controller.signal.aborted) return
				setQr(data)
				setMessage(t('qr.fallbackScan'))
				timer = setTimeout(() => void poll(data.key), pollInterval)
			} catch (error: unknown) {
				showError(error)
			} finally {
				if (!controller.signal.aborted) {
					generatingRef.current = false
					setBusy(false)
				}
			}
		}

		void createQr()
		return () => {
			clearTimeout(timer)
			generateQr.cancel()
			controller.abort()
		}
	}, [attempt, generateQr, onSuccess, serverMessage, t])

	return (
		<div className="space-y-4">
			{qr && <img src={qr.image} alt={t('qr.imageAlt')} width={240} height={240} className="mx-auto rounded-lg" />}
			<p role="status" className="text-sm text-zinc-500">
				{message}
			</p>
			<button
				type="button"
				disabled={busy}
				aria-busy={busy}
				onClick={handleGenerate}
				className="w-full cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
			>
				{busy ? t('qr.busy') : t('qr.refresh')}
			</button>
		</div>
	)
}
