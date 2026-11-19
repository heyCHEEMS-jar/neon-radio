import type { FastifyInstance } from 'fastify'
import WebSocket from 'ws'
import { getMainPlayback } from '../modules/playback/index.js'
import { getRoamingSongs } from '../modules/roaming/index.js'
import { getNeteaseSyncState } from '../modules/session/index.js'
import { getRadioOptions } from '../modules/settings/index.js'
import { isSameOrigin } from '../platform/http/same-origin.js'
import { bindBroadcasts } from './broadcast.js'
import { createConnection, createPool } from './connection.js'
import {
	cancelPendingPlayback,
	handleMainSyncRequest,
	handleNextRequest,
	handlePauseRequest,
	handlePlaybackRequest,
	handleSeekRequest
} from './handlers/playback.js'
import { handleSyncRequest } from './handlers/sync.js'
import { parseCommand } from './protocol.js'

// 实时入口只负责连接、分派和关闭，业务规则都在模块层
export default function initLive(fastify: FastifyInstance) {
	const pool = createPool(fastify)
	const broadcasts = bindBroadcasts(pool, fastify)

	pool.server.on('connection', (socket, request) => {
		if (!isSameOrigin(request)) {
			socket.close(1008, '不允许跨站连接')
			return
		}
		const connection = createConnection(socket, request)
		pool.connections.set(socket, connection)
		socket.on('pong', () => {
			connection.alive = true
		})
		socket.on('error', () => socket.terminate())
		socket.on('close', () => pool.connections.delete(socket))

		// 首次连接发送配置、歌曲及主线快照
		pool.send(connection, { type: 'radio-options', data: getRadioOptions() })
		pool.send(connection, { type: 'radio-songs', data: getRoamingSongs() })
		pool.send(connection, { type: 'playback-state', data: getMainPlayback() })
		broadcasts.sendSync(getNeteaseSyncState(), true, connection)

		socket.on('message', async (payload, binary) => {
			const command = binary ? null : parseCommand(payload.toString())
			if (!command) {
				socket.close(1008, '未知实时指令')
				return
			}
			if (command.type === 'netease-sync-request') {
				await handleSyncRequest(pool, connection, command)
				return
			}
			// 同一连接按收到的顺序处理选歌、开启同步和拖动进度
			connection.queue = connection.queue.then(() => {
				if (command.type === 'main-sync-request') return handleMainSyncRequest(pool, connection, command)
				if (command.type === 'playback-seek-request') return handleSeekRequest(pool, connection, command)
				if (command.type === 'playback-next-request') return handleNextRequest(pool, connection, command)
				if (command.type === 'playback-pause-request') return handlePauseRequest(pool, connection, command)
				return handlePlaybackRequest(pool, connection, command)
			})
			await connection.queue
		})
	})

	// 心跳清理断线客户端，让浏览器及时重连
	const heartbeat = setInterval(() => {
		for (const connection of pool.connections.values()) {
			if (connection.socket.readyState !== WebSocket.OPEN) continue
			if (!connection.alive) {
				connection.socket.terminate()
				continue
			}
			connection.alive = false
			connection.socket.ping()
		}
	}, 30_000)
	heartbeat.unref()

	fastify.addHook('preClose', async () => {
		clearInterval(heartbeat)
		cancelPendingPlayback()
		broadcasts.dispose()
		await pool.stop()
		await broadcasts.wait()
	})
}
