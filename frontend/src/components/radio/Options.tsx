'use client'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import useRadioOptions from '@/hooks/useRadioOptions'

const optionMessages = {
	loading: '正在读取电台配置…',
	ready: '配置已与服务端同步。',
	saving: '正在保存电台配置…',
	error: '配置读取失败，请重试。'
}

export default function Options({ onClose }: { onClose: () => void }) {
	const { options, status, load, update } = useRadioOptions(true)

	return (
		<Dialog open onOpenChange={open => { if (!open && status !== 'saving') onClose() }}>
			<DialogContent aria-busy={status === 'loading' || status === 'saving'} showCloseButton={status !== 'saving'}>
				<DialogHeader>
					<DialogTitle>电台选项</DialogTitle>
					<DialogDescription>{optionMessages[status]}</DialogDescription>
				</DialogHeader>
				{options && (
					<div className="space-y-5">
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<label htmlFor="guest-roaming" className="block text-sm font-medium">游客自漫游</label>
								<p id="guest-roaming-description" className="text-sm text-zinc-500">
									允许游客自行选歌或拖动进度，脱离当前同步，仅影响自己，不影响主线电台。
								</p>
							</div>
							<Switch
								id="guest-roaming"
								checked={options.guestRoamingEnabled}
								onCheckedChange={enabled => update('guestRoamingEnabled', enabled)}
								disabled={status !== 'ready'}
								aria-describedby="guest-roaming-description"
								className="mt-0.5"
							/>
						</div>
						<div className="flex items-start justify-between gap-4">
							<div className="space-y-1">
								<label htmlFor="emoji-chat" className="block text-sm font-medium">Emoji 聊天</label>
								<p id="emoji-chat-description" className="text-sm text-zinc-500">仅支持发送提供的表情，不允许发送文字。</p>
							</div>
							<Switch
								id="emoji-chat"
								checked={options.emojiChatEnabled}
								onCheckedChange={enabled => update('emojiChatEnabled', enabled)}
								disabled={status !== 'ready'}
								aria-describedby="emoji-chat-description"
								className="mt-0.5"
							/>
						</div>
					</div>
				)}
				{status === 'error' && (
					<button type="button" onClick={load} className="cursor-pointer rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">重新加载</button>
				)}
			</DialogContent>
		</Dialog>
	)
}
