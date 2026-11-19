'use client'

import { useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import useRadioOptions from '@/features/radio/settings/useRadioOptions'
import { isPlaybackOrder } from '@neon-radio/protocol'
import { debounce } from '@/lib/debounce'

const optionMessages = {
	loading: '正在读取电台配置…',
	ready: '配置已与服务端同步。',
	saving: '正在保存电台配置…',
	error: '配置读取失败，请重试。'
}

// 展示管理员电台选项，开启主线同步前单独确认
export default function Options({ onClose }: { onClose: () => void }) {
	const { options, status, load, update, neteaseSync, syncPending, successfulSyncId, sync } = useRadioOptions(true)
	const [confirmingMainSync, setConfirmingMainSync] = useState(false)
	// 每次打开记录已有成功任务，新成功只隐藏本次弹窗的入口
	const [initialSuccessfulSyncId] = useState(successfulSyncId)
	const syncSucceeded = successfulSyncId !== null && successfulSyncId !== initialSuccessfulSyncId
	const syncing = syncPending || neteaseSync?.phase === 'refreshing' || neteaseSync?.phase === 'syncing'
	const busy = status === 'saving' || syncPending
	const syncMessage = syncPending ? '正在发送同步请求…' : neteaseSync?.message

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
						<DialogTitle>电台选项</DialogTitle>
						<DialogDescription>{syncing ? syncMessage : optionMessages[status]}</DialogDescription>
					</DialogHeader>
					{options && (
						<div className="space-y-5">
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<p id="playback-order-label" className="text-sm font-medium">播放顺序</p>
									<p className="text-sm text-zinc-500">切歌时生效，主线和本地漫游分别播放。</p>
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
									<option value="random">随机播放</option>
									<option value="sequential">顺序播放</option>
									<option value="single">单曲循环</option>
								</select>
							</div>
							<div className="flex items-start justify-between gap-4">
								<div className="space-y-1">
									<p id="guest-roaming-label" className="text-sm font-medium">
										游客自漫游
									</p>
									<p id="guest-roaming-description" className="text-sm text-zinc-500">
										自行选歌、调整进度，不影响主线电台。
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
										强制同步到主电台
									</p>
									<p id="force-main-sync-description" className="text-sm text-zinc-500">
										开启时推送当前歌曲和进度，管理员选歌会影响主线听众，游客漫游不受影响。
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
							重新加载
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
								{syncing ? <Spinner aria-label="正在同步网易云数据" /> : <RefreshCw className="size-4" />}
								{syncing ? '正在同步…' : '重新同步网易云数据'}
							</button>
						</div>
					)}
				</DialogContent>
			</Dialog>
			<Dialog open={confirmingMainSync} onOpenChange={setConfirmingMainSync}>
				<DialogContent role="alertdialog" showCloseButton={false}>
					<DialogTitle>开启主线同步</DialogTitle>
					<DialogDescription>
						开启后，本页面当前歌曲和播放进度会立即推送到主电台，主线听众将同步切换；之后所有已登录管理员页面的选歌操作都会影响主电台，游客漫游仍独立播放。确定开启吗？
					</DialogDescription>
					<div className="flex justify-end gap-2">
						<button
							type="button"
							onClick={() => setConfirmingMainSync(false)}
							className="cursor-pointer rounded-md border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-100"
						>
							取消
						</button>
						<button
							type="button"
							onClick={enableMainSync}
							disabled={status !== 'ready' || busy}
							className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
						>
							确认开启
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
