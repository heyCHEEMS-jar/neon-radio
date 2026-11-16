'use client'

import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { debounce } from '@/utils/util'
import { RadioLiveContext, type RadioOptions } from './useRadioLive'

interface RadioOptionUpdate {
	key: keyof RadioOptions
	enabled: boolean
}

type OptionsStatus = 'loading' | 'ready' | 'saving' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function requestRadioOptions(signal: AbortSignal, update: RadioOptionUpdate): Promise<RadioOptions> {
	const response = await fetch('/neon-radio/radio-options', {
		method: 'PATCH',
		cache: 'no-store',
		signal,
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(update)
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
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error('电台选项需要放在电台实时管线内')
	const [saving, setSaving] = useState(false)
	const status: OptionsStatus = saving ? 'saving' : live.status
	const requestRef = useRef<AbortController | null>(null)
	const pendingUpdates = useRef(new Map<keyof RadioOptions, boolean>())

	// 合并短时间内的修改，保存成功后由实时管线更新开关
	const save = useMemo(
		() =>
			debounce(async () => {
				if (requestRef.current || !pendingUpdates.current.size) return
				const updates = [...pendingUpdates.current]
				pendingUpdates.current.clear()
				const controller = new AbortController()
				requestRef.current = controller
				setSaving(true)
				try {
					// 依次保存，不用 HTTP 响应覆盖较新的实时快照
					for (const [key, enabled] of updates) {
						try {
							await requestRadioOptions(controller.signal, { key, enabled })
							if (controller.signal.aborted) return
						} catch (error: unknown) {
							if (controller.signal.aborted) return
							toast.error('保存电台选项失败', { description: error instanceof Error ? error.message : '请稍后重试' })
						}
					}
				} finally {
					if (requestRef.current === controller) {
						requestRef.current = null
						setSaving(false)
					}
				}
			}, 300),
		[]
	)

	// 关闭弹窗时清理防抖任务和在途保存请求，实时连接继续由页面维护
	useEffect(() => {
		if (!open) {
			setSaving(false)
			return
		}
		return () => {
			save.cancel()
			pendingUpdates.current.clear()
			requestRef.current?.abort()
			requestRef.current = null
		}
	}, [open, save])

	const update = (key: keyof RadioOptions, enabled: boolean) => {
		if (!open || !live.options || live.status !== 'ready' || requestRef.current) return
		if (live.options[key] === enabled) pendingUpdates.current.delete(key)
		else pendingUpdates.current.set(key, enabled)
		if (pendingUpdates.current.size) save()
		else save.cancel()
	}

	return {
		options: live.options,
		status,
		load: live.reconnect,
		update,
		neteaseSync: live.neteaseSync,
		syncPending: live.syncPending,
		syncSucceeded: live.syncSucceeded,
		sync: live.syncNetease
	}
}
