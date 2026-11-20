'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import useRadioOptions from '@/features/radio/settings/useRadioOptions'
import { isPlaybackOrder } from '@neon-radio/protocol'
import { useI18n } from '@/i18n/context'
import type { StringKey } from '@/i18n/locales'
import { debounce } from '@/lib/debounce'

const optionMessages: Record<'loading' | 'ready' | 'saving' | 'error', StringKey> = {
	loading: 'options.loading',
	ready: 'options.ready',
	saving: 'options.saving',
	error: 'options.loadError'
}

// 展示管理员电台选项，开启主线同步前单独确认
export default function Options({ onClose }: { onClose: () => void }) {
	const { t, serverMessage } = useI18n()
	const { options, status, load, update, neteaseSync, syncPending, successfulSyncId, sync } = useRadioOptions(true)
	const [confirmingMainSync, setConfirmingMainSync] = useState(false)
	// 每次打开记录已有成功任务，新成功只隐藏本次弹窗的入口
	const [initialSuccessfulSyncId] = useState(successfulSyncId)
	const syncSucceeded = successfulSyncId !== null && successfulSyncId !== initialSuccessfulSyncId
	const syncing = syncPending || neteaseSync?.phase === 'refreshing' || neteaseSync?.phase === 'syncing'
	const busy = status === 'saving' || syncPending
	const syncMessage = syncPending ? t('options.syncSending') : neteaseSync && serverMessage(neteaseSync.message)

	// 网易云数据刷新沿用原有点击合并，与主线播放操作无关
	const debouncedSync = useMemo(() => debounce(sync, 300), [sync])
	useEffect(() => () => debouncedSync.cancel(), [debouncedSync])

	// 每次开启都弹确认；关闭直接保存，不影响当前主线歌曲
	const handleMainSyncChange = (enabled: boolean) => {
		if (enabled) setConfirmingMainSync(true)
		else void update('forceMainPlaybackSyncEnabled', false)
	}
	// 确认后一起提交开关及本页面播放进度，开关值等待服务端广播
	const enableMainSync = () => {
		setConfirmingMainSync(false)
		void update('forceMainPlaybackSyncEnabled', true)
	}

	return (
		<>
			<Dialog
				open
				onOpenChange={open => {
					if (!open && !busy && !confirmingMainSync) onClose()
				}}
			>
				<DialogContent aria-busy={status === 'loading' || busy} showCloseButton={!busy}>
					<DialogHeader>
						<DialogTitle>{t('options.title')}</DialogTitle>
						<DialogDescription>{syncing ? syncMessage : t(optionMessages[status])}</DialogDescription>
					</DialogHeader>
					{options && (
						<div className="space-y-5">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<p id="playback-order-label" className="text-sm font-medium">{t('options.orderLabel')}</p>
									<p className="text-sm text-zinc-500">{t('options.orderHint')}</p>
								</div>
								<select
									value={options.playbackOrder ?? 'random'}
									disabled={status !== 'ready' || busy}
									aria-labelledby="playback-order-label"
									className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-50"
									onChange={event => {
										const order = event.currentTarget.value // 原生下拉框的值通过共用校验收窄
										if (isPlaybackOrder(order)) void update('playbackOrder', order)
									}}
								>
									<option value="random">{t('playback.random')}</option>
									<option value="sequential">{t('playback.sequential')}</option>
									<option value="single">{t('playback.single')}</option>
								</select>
							</div>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<p id="guest-roaming-label" className="text-sm font-medium">
										{t('options.guestRoaming')}
									</p>
									<p id="guest-roaming-description" className="text-sm text-zinc-500">
										{t('options.guestRoamingHint')}
									</p>
								</div>
								<Switch
									id="guest-roaming"
									checked={options.guestRoamingEnabled}
									onCheckedChange={enabled => void update('guestRoamingEnabled', enabled)}
									disabled={status !== 'ready' || busy}
									aria-labelledby="guest-roaming-label"
									aria-describedby="guest-roaming-description"
									className="mt-0.5"
								/>
							</div>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<p id="force-main-sync-label" className="text-sm font-medium">
										{t('options.forceSync')}
									</p>
									<p id="force-main-sync-description" className="text-sm text-zinc-500">
										{t('options.forceSyncHint')}
									</p>
								</div>
								<Switch
									id="force-main-sync"
									checked={options.forceMainPlaybackSyncEnabled}
									onCheckedChange={handleMainSyncChange}
									disabled={status !== 'ready' || busy}
									aria-labelledby="force-main-sync-label"
									aria-describedby="force-main-sync-description"
									className="mt-0.5"
								/>
							</div>
						</div>
					)}
					{status === 'error' && (
						<button
							type="button"
							onClick={load}
							disabled={busy}
							className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
						>
							{t('common.retry')}
						</button>
					)}
					{!syncSucceeded && (
						<div className="space-y-3 border-t border-zinc-200 pt-4">
							<button
								type="button"
								onClick={debouncedSync}
								disabled={status !== 'ready' || busy || syncing}
								className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
							>
								{syncing ? <Spinner aria-label={t('options.syncPending')} /> : <RefreshCw className="size-4" />}
								{syncing ? t('options.syncing') : t('options.resync')}
							</button>
						</div>
					)}
				</DialogContent>
			</Dialog>
			<Dialog open={confirmingMainSync} onOpenChange={setConfirmingMainSync}>
				<DialogContent role="alertdialog" showCloseButton={false}>
					<DialogTitle>{t('options.confirmSyncTitle')}</DialogTitle>
					<DialogDescription>{t('options.confirmSyncDescription')}</DialogDescription>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setConfirmingMainSync(false)}
							className="cursor-pointer rounded-md border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100"
						>
							{t('common.cancel')}
						</button>
						<button
							type="button"
							onClick={enableMainSync}
							disabled={status !== 'ready' || busy}
							className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							{t('options.confirmEnable')}
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
