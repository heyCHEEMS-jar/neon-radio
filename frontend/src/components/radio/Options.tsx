'use client'

import { RefreshCw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import useRadioOptions from '@/hooks/useRadioOptions'

const optionMessages = {
	loading: '正在读取电台配置…',
	ready: '配置已与服务端同步。',
	saving: '正在保存电台配置…',
	error: '配置读取失败，请重试。'
}

export default function Options({ onClose }: { onClose: () => void }) {
	const { options, status, load, update, neteaseSync, syncPending, syncSucceeded, sync } = useRadioOptions(true)
	const syncing = syncPending || neteaseSync?.phase === 'refreshing' || neteaseSync?.phase === 'syncing'
	const busy = status === 'saving' || syncPending
	const syncMessage = syncPending ? '正在发送同步请求…' : neteaseSync?.message

	return (
		<Dialog
			open
			onOpenChange={open => {
				if (!open && !busy) onClose()
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
								onCheckedChange={enabled => update('guestRoamingEnabled', enabled)}
								disabled={status !== 'ready' || busy}
								aria-labelledby="guest-roaming-label"
								aria-describedby="guest-roaming-description"
								className="mt-0.5"
							/>
						</div>
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<p id="emoji-chat-label" className="text-sm font-medium">
									Emoji 聊天
								</p>
								<p id="emoji-chat-description" className="text-sm text-zinc-500">
									仅限发送表情。
								</p>
							</div>
							<Switch
								id="emoji-chat"
								checked={options.emojiChatEnabled}
								onCheckedChange={enabled => update('emojiChatEnabled', enabled)}
								disabled={status !== 'ready' || busy}
								aria-labelledby="emoji-chat-label"
								aria-describedby="emoji-chat-description"
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
							onClick={sync}
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
	)
}
