'use client'

import { useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { RadioLiveContext, readRadioOptions, type RadioOptions } from './useRadioLive'

interface RadioOptionUpdate {
	key: keyof RadioOptions
	value: RadioOptions[keyof RadioOptions]
}

type OptionsStatus = 'loading' | 'ready' | 'saving' | 'error'

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 保存单项配置并校验结果，界面仍以 WS 广播为准
async function requestRadioOptions(signal: AbortSignal, update: RadioOptionUpdate) {
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
	readRadioOptions(result.data)
}

// 管理配置保存状态，配置和同步结果由页面实时连接维护
export default function useRadioOptions(open: boolean) {
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error('电台选项需要放在电台实时管线内')
	const [saving, setSaving] = useState(false)
	const status: OptionsStatus = saving ? 'saving' : live.status
	const requestRef = useRef<AbortController | null>(null)

	// 关闭弹窗时释放请求，已经提交的配置仍会通过 WS 广播
	useEffect(() => {
		if (!open) {
			setSaving(false)
			return
		}
		return () => {
			requestRef.current?.abort()
			requestRef.current = null
		}
	}, [open])

	// 立即保存用户确认的修改，不在前端积压防抖任务
	const update = async <K extends keyof RadioOptions>(key: K, value: RadioOptions[K]) => {
		if (!open || !live.options || live.status !== 'ready' || requestRef.current || live.options[key] === value) return
		const controller = new AbortController()
		requestRef.current = controller
		setSaving(true)
		try {
			if (key === 'forceMainPlaybackSyncEnabled' && value === true) {
				// 开启时一起提交本页面的歌曲和进度，配置与播放结果仍以实时广播为准
				await live.enableMainPlaybackSync()
			} else {
				// 其他开关沿用 HTTP 保存，不用响应覆盖更新的配置
				await requestRadioOptions(controller.signal, { key, value })
			}
		} catch (error: unknown) {
			if (!controller.signal.aborted) {
				toast.error('保存电台选项失败', { description: error instanceof Error ? error.message : '请稍后重试' })
			}
		} finally {
			if (requestRef.current === controller) {
				requestRef.current = null
				setSaving(false)
			}
		}
	}

	return {
		options: live.options,
		status,
		load: live.reconnect,
		update,
		neteaseSync: live.neteaseSync,
		syncPending: live.syncPending,
		successfulSyncId: live.successfulSyncId,
		sync: live.syncNetease
	}
}
