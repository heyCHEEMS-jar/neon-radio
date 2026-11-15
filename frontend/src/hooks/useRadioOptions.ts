'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { debounce } from '@/utils/util'

interface RadioOptions {
	guestRoamingEnabled: boolean
	emojiChatEnabled: boolean
}

interface RadioOptionUpdate {
	key: keyof RadioOptions
	enabled: boolean
}

type OptionsStatus = 'loading' | 'ready' | 'saving' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function requestRadioOptions(signal: AbortSignal, update?: RadioOptionUpdate): Promise<RadioOptions> {
	const response = await fetch('/neon-radio/radio-options', {
		method: update ? 'PATCH' : 'GET',
		cache: 'no-store',
		signal,
		...(update ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update) } : {})
	})
	if (!response.headers.get('content-type')?.includes('application/json')) {
		throw new Error(`服务端未正常响应（HTTP ${response.status}）`)
	}
	const result: unknown = await response.json()
	if (!isRecord(result)) throw new Error('电台选项返回格式异常')
	if (!response.ok || result.code !== 200) {
		throw new Error(typeof result.message === 'string' ? result.message : '电台选项请求失败')
	}
	const data = result.data
	if (!isRecord(data) || typeof data.guestRoamingEnabled !== 'boolean' || typeof data.emojiChatEnabled !== 'boolean') {
		throw new Error('电台选项数据异常')
	}
	return { guestRoamingEnabled: data.guestRoamingEnabled, emojiChatEnabled: data.emojiChatEnabled }
}

export default function useRadioOptions(open: boolean) {
	const [options, setOptions] = useState<RadioOptions | null>(null)
	const [status, setStatus] = useState<OptionsStatus>('loading')
	const requestRef = useRef<AbortController | null>(null)
	const pendingUpdates = useRef(new Map<keyof RadioOptions, boolean>())

	const load = useCallback(async () => {
		if (requestRef.current) return
		const controller = new AbortController()
		requestRef.current = controller
		setOptions(null)
		setStatus('loading')
		try {
			const data = await requestRadioOptions(controller.signal)
			if (controller.signal.aborted) return
			setOptions(data)
			setStatus('ready')
		} catch (error: unknown) {
			if (controller.signal.aborted) return
			setStatus('error')
			toast.error('读取电台选项失败', { description: error instanceof Error ? error.message : '请稍后重试' })
		} finally {
			if (requestRef.current === controller) requestRef.current = null
		}
	}, [])

	// 合并短时间内的修改，保存成功后才更新开关
	const save = useMemo(
		() =>
			debounce(async () => {
				if (requestRef.current || !pendingUpdates.current.size) return
				const updates = [...pendingUpdates.current]
				pendingUpdates.current.clear()
				const controller = new AbortController()
				requestRef.current = controller
				setStatus('saving')
				try {
					// 依次保存，避免整份配置响应乱序覆盖
					for (const [key, enabled] of updates) {
						try {
							const data = await requestRadioOptions(controller.signal, { key, enabled })
							if (controller.signal.aborted) return
							setOptions(data)
						} catch (error: unknown) {
							if (controller.signal.aborted) return
							toast.error('保存电台选项失败', { description: error instanceof Error ? error.message : '请稍后重试' })
						}
					}
				} finally {
					if (requestRef.current === controller) {
						requestRef.current = null
						setStatus('ready')
					}
				}
			}, 300),
		[]
	)

	// 关闭弹窗时清理防抖任务和在途请求
	useEffect(() => {
		if (!open) {
			setOptions(null)
			setStatus('loading')
			return
		}
		void load()
		return () => {
			save.cancel()
			pendingUpdates.current.clear()
			requestRef.current?.abort()
			requestRef.current = null
		}
	}, [open, load, save])

	const update = (key: keyof RadioOptions, enabled: boolean) => {
		if (!options || requestRef.current) return
		if (options[key] === enabled) pendingUpdates.current.delete(key)
		else pendingUpdates.current.set(key, enabled)
		if (pendingUpdates.current.size) save()
		else save.cancel()
	}

	return { options, status, load, update }
}
