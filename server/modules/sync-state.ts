import { EventEmitter } from 'node:events'
import type { NeteaseSyncState } from '@neon-radio/protocol'
import { AppError, UpstreamError } from '../platform/errors.js'

export const neteaseSyncEvents = new EventEmitter<{ change: [NeteaseSyncState] }>()
let current: NeteaseSyncState | null = null

export function getNeteaseSyncState() {
	return current
}

// 只记录手动任务，刷新凭证和歌曲入库共用同一份状态
export function publishNeteaseSync(state: NeteaseSyncState) {
	current = state
	neteaseSyncEvents.emit('change', state)
	return state
}

// 只下发可公开的错误说明，不透传网易云响应或数据库错误
export function readNeteaseSyncError(error: unknown) {
	if (error instanceof AppError) return error.message
	if (error instanceof UpstreamError) {
		if (error.kind === 'expired') return '网易云登录已失效，请重新登录'
		if (error.kind === 'forbidden') return '网易云拒绝访问，请重新登录或稍后重试'
	}
	return '请求网易云失败，请稍后重试'
}
