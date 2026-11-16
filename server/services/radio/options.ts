import { EventEmitter } from 'node:events'
import config from '../../config.js'
import { initRadioOptionsRepository, saveRadioOption, type RadioOptions } from '../../repositories/radio-options.js'

export type { RadioOptions } from '../../repositories/radio-options.js'

export const radioOptionsEvents = new EventEmitter<{ change: [RadioOptions] }>()
let currentOptions: RadioOptions = { guestRoamingEnabled: false, emojiChatEnabled: false }
let pendingUpdate = Promise.resolve()

// 实时连接只读取数据库已提交的配置快照
export async function initRadioOptions() {
	currentOptions = await initRadioOptionsRepository(config.NETEASE_UID)
}

export function getRadioOptions(): RadioOptions {
	return { ...currentOptions }
}

// 串行保存指定开关，提交成功后再广播，避免多浏览器更新乱序
export function updateRadioOption(key: keyof RadioOptions, enabled: boolean): Promise<RadioOptions> {
	const next = pendingUpdate.then(async () => {
		await saveRadioOption(config.NETEASE_UID, key, enabled)
		currentOptions = { ...currentOptions, [key]: enabled }
		const options = getRadioOptions()
		radioOptionsEvents.emit('change', options)
		return options
	})
	pendingUpdate = next.then(() => {}, () => {})
	return next
}
