import { AppError } from '../platform/errors.js'
import type { LiveConnection, LivePool } from './connection.js'

// 实时命令统一错误回包：业务错误保留状态码，其余按服务不可用处理
export function respondError(
	pool: LivePool,
	connection: LiveConnection,
	type: 'playback-response' | 'netease-sync-response',
	requestId: string,
	error: unknown,
	fallback: string
) {
	pool.send(connection, {
		type,
		requestId,
		code: error instanceof AppError ? error.status : 503,
		message: error instanceof Error ? error.message : fallback
	})
}
