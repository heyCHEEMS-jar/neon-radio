import { EventEmitter } from 'node:events'
import { ApiError } from '../../utils/api-error.js'
import { isRecord } from '../../utils/object.js'

export interface NeteaseSyncState {
	id: string
	phase: 'refreshing' | 'syncing' | 'success' | 'error'
	message: string
}

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
	if (error instanceof ApiError) return error.message
	const body = isRecord(error) && isRecord(error.body) ? error.body : undefined
	const data = isRecord(body?.data) ? body.data : undefined
	const code = body?.code ?? data?.code
	if (code === 301 || code === 401) return '网易云登录已失效，请重新登录'
	if (code === 403) return '网易云拒绝访问，请重新登录或稍后重试'
	return '请求网易云失败，请稍后重试'
}
