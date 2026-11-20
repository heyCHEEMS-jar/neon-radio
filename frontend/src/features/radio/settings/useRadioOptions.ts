'use client'

import type { RadioOptions } from '@neon-radio/protocol'
import { useContext, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { serverMessage, t } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { saveRadioOption } from '../api'
import { RadioLiveContext } from '../live/useRadioLive'

type OptionsStatus = 'loading' | 'ready' | 'saving' | 'error'

// 管理配置保存状态，配置和同步结果由页面实时连接维护
export default function useRadioOptions(open: boolean) {
	const live = useContext(RadioLiveContext)
	if (!live) throw new Error(t('options.outsideLive'))
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
				await saveRadioOption({ key, value }, controller.signal)
			}
		} catch (error: unknown) {
			if (!controller.signal.aborted) {
				toast.error(t('options.saveFailed'), { description: error instanceof ApiError ? serverMessage(error.serverMessage) : t('options.tryLater') })
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
