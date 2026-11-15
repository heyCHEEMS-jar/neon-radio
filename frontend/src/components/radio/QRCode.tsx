'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { debounce } from '@/utils/util'

interface LoginQr {
	key: string
	image: string
}

const pollInterval = 2_000

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

async function loginRequest(path: string, signal: AbortSignal): Promise<Record<string, unknown>> {
	const response = await fetch(`/neon-radio/${path}`, { method: 'POST', cache: 'no-store', signal })
	if (!response.headers.get('content-type')?.includes('application/json')) {
		throw new Error(`服务端未正常响应（HTTP ${response.status}），请确认 NETEASE_UID 已配置并重启服务端`)
	}
	const result: unknown = await response.json()
	if (!isRecord(result)) throw new Error('服务返回格式异常')
	if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : '请求失败')
	return result
}

export default function LoginForm() {
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
			setMessage(error instanceof Error ? error.message : '登录请求失败')
			setQr(null)
		}

		const poll = async (key: string) => {
			try {
				const result = await loginRequest(`login-qr/${encodeURIComponent(key)}`, controller.signal)
				if (controller.signal.aborted) return
				setMessage(typeof result.message === 'string' ? result.message : '请用网易云音乐 App 扫码，并在手机上确认。')
				if (result.code === 800 || result.code === 803) setQr(null)
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
				const result = await loginRequest('login-qr', controller.signal)
				if (controller.signal.aborted) return
				const data = result.data
				if (!isRecord(data) || typeof data.key !== 'string' || typeof data.image !== 'string') throw new Error('二维码数据异常')
				const nextQr = { key: data.key, image: data.image }
				setQr(nextQr)
				setMessage('请用网易云音乐 App 扫码，并在手机上确认。')
				timer = setTimeout(() => void poll(nextQr.key), pollInterval)
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
	}, [attempt, generateQr])

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
