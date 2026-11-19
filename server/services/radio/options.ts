import { EventEmitter } from 'node:events'
import config from '../../config.js'
import { initRadioOptionsRepository, saveRadioOption, type RadioOptions } from '../../repositories/radio-options.js'

export type { RadioOptions } from '../../repositories/radio-options.js'

export const radioOptionsEvents = new EventEmitter<{ change: [RadioOptions] }>()
let currentOptions: RadioOptions = { guestRoamingEnabled: false, emojiChatEnabled: false, forceMainPlaybackSyncEnabled: false, playbackOrder: 'random' }
let pendingUpdate = Promise.resolve()

// 实时连接只读取数据库已提交的配置快照
export async function initRadioOptions() {
	currentOptions = await initRadioOptionsRepository(config.NETEASE_UID)
}

export function getRadioOptions(): RadioOptions {
	return { ...currentOptions }
}

// 串行保存单项配置，提交后广播，播放顺序同样走这条管线
export function updateRadioOption<K extends keyof RadioOptions>(key: K, value: RadioOptions[K]): Promise<RadioOptions> {
	const next = pendingUpdate.then(async () => {
		await saveRadioOption(config.NETEASE_UID, key, value)
		currentOptions = { ...currentOptions, [key]: value }
		const options = getRadioOptions()
		radioOptionsEvents.emit('change', options)
		return options
	})
	pendingUpdate = next.then(
		() => {},
		() => {}
	)
	return next
}
