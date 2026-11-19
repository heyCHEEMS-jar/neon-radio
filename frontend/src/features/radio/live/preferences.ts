import type { PlaybackOrder } from '@neon-radio/protocol'
import { playbackOrderSchema } from '@neon-radio/protocol'

const localPlaybackOrderKey = 'playback-order'

// 浏览器存储不可用或旧值无效时返回 null，由调用方保留默认顺序
export function readLocalPlaybackOrder(): PlaybackOrder | null {
	try {
		const parsed = playbackOrderSchema.safeParse(localStorage.getItem(localPlaybackOrderKey))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

// 只影响当前浏览器的游客漫游偏好，不向服务端提交
export function saveLocalPlaybackOrder(order: PlaybackOrder) {
	try {
		localStorage.setItem(localPlaybackOrderKey, order)
		return true
	} catch {
		return false
	}
}
