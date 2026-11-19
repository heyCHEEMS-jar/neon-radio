import type { LiveCommand } from '@neon-radio/protocol'
import WebSocket from 'ws'
import { startNeteaseSync } from '../../modules/session/index.js'
import { AppError } from '../../platform/errors.js'
import type { LiveConnection, LivePool } from '../connection.js'
import { respondError } from '../respond.js'

type SyncRequest = Extract<LiveCommand, { type: 'netease-sync-request' }>
const checking = new WeakSet<LiveConnection>()

// 管理员手动启动网易云同步，任务完成另行下发状态
export async function handleSyncRequest(pool: LivePool, connection: LiveConnection, command: SyncRequest) {
	if (checking.has(connection)) {
		pool.send(connection, { type: 'netease-sync-response', requestId: command.requestId, code: 429, message: '正在处理同步请求，请稍后重试' })
		return
	}
	checking.add(connection)
	try {
		if (!(await pool.authorize(connection))) throw new AppError(401, '请先扫码登录电台')
		if (pool.closing || connection.socket.readyState !== WebSocket.OPEN) return
		startNeteaseSync()
		// 这里只确认受理，最终成功必须等歌曲入库后由状态消息通知
		pool.send(connection, { type: 'netease-sync-response', requestId: command.requestId, code: 202 })
	} catch (error: unknown) {
		respondError(pool, connection, 'netease-sync-response', command.requestId, error, '登录状态检查失败，请稍后重试')
	} finally {
		checking.delete(connection)
	}
}
