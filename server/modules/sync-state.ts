import { EventEmitter } from 'node:events'
import type { NeteaseSyncState, ServerMessage } from '@neon-radio/protocol'
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
export function readNeteaseSyncError(error: unknown): ServerMessage {
	if (error instanceof AppError) return error.serverMessage
	if (error instanceof UpstreamError) {
		if (error.kind === 'expired') return { key: 'upstream.expiredSync' }
		if (error.kind === 'forbidden') return { key: 'upstream.forbiddenSync' }
	}
	return { key: 'upstream.failedSync' }
}
