import { EventEmitter } from 'node:events'
import type { PlaybackOrder, RadioOptions } from '@neon-radio/protocol'
import config from '../../config.js'
import { readOptionsRow, saveFlagRow, savePlaybackOrderRow } from './store.js'

export const optionsEvents = new EventEmitter<{ change: [RadioOptions] }>()
let currentOptions: RadioOptions = { guestRoamingEnabled: false, forceMainPlaybackSyncEnabled: false, playbackOrder: 'random' }
let pendingUpdate = Promise.resolve()

// 实时连接只读取数据库已提交的配置快照
export async function initSettings() {
	currentOptions = await readOptionsRow(config.NETEASE_UID)
}

export function getRadioOptions(): RadioOptions {
	return { ...currentOptions }
}

// 串行保存单项配置，提交后广播
export function updateRadioOption<K extends keyof RadioOptions>(key: K, value: RadioOptions[K]): Promise<RadioOptions> {
	const next = pendingUpdate.then(async () => {
		if (key === 'playbackOrder') await savePlaybackOrderRow(config.NETEASE_UID, value as PlaybackOrder)
		else await saveFlagRow(config.NETEASE_UID, key as 'guestRoamingEnabled' | 'forceMainPlaybackSyncEnabled', value as boolean)
		currentOptions = { ...currentOptions, [key]: value }
		const options = getRadioOptions()
		optionsEvents.emit('change', options)
		return options
	})
	pendingUpdate = next.then(
		() => {},
		() => {}
	)
	return next
}
