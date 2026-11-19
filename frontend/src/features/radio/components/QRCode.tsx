'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { checkLoginQr, createLoginQr, type LoginQr } from '@/features/radio/api'
import { debounce } from '@/lib/debounce'

const pollInterval = 2_000

export default function QRCode({ onSuccess }: { onSuccess: () => void }) {
	const [qr, setQr] = useState<LoginQr | null>(null)
	const [attempt, setAttempt] = useState(0)
	const [busy, setBusy] = useState(true)
	const [message, setMessage] = useState('正在生成二维码…')
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
			const errorMessage = error instanceof Error ? error.message : '登录请求失败'
			setMessage(errorMessage)
			setQr(null)
			toast.error(errorMessage)
		}

		const poll = async (key: string) => {
			try {
				const result = await checkLoginQr(key, controller.signal)
				if (controller.signal.aborted) return
				setMessage(result.message ?? '请用网易云音乐 App 扫码，并在手机上确认。')
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
			setMessage('正在生成二维码…')
			try {
				const data = await createLoginQr(controller.signal)
				if (controller.signal.aborted) return
				setQr(data)
				setMessage('请用网易云音乐 App 扫码，并在手机上确认。')
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
	}, [attempt, generateQr, onSuccess])

	return (
		<div className="space-y-4">
			{qr && <img src={qr.image} alt="网易云音乐登录二维码" width={240} height={240} className="mx-auto rounded-lg" />}
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
				{busy ? '生成中…' : '刷新二维码'}
			</button>
		</div>
	)
}
