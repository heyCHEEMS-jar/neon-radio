import type { IncomingMessage } from 'node:http'
import type { PlaybackSnapshot } from '@neon-radio/protocol'
import type { FastifyInstance } from 'fastify'
import WebSocket, { WebSocketServer } from 'ws'
import { getSessionStatus, hasBrowserSession } from '../modules/session/index.js'
import { readTokenCookie } from '../platform/http/cookie.js'

export interface LiveConnection {
	socket: WebSocket
	request: IncomingMessage
	token: string
	authorized: boolean
	local: PlaybackSnapshot | null
	queue: Promise<void>
	alive: boolean
}

export interface LivePool {
	server: WebSocketServer
	connections: Map<WebSocket, LiveConnection>
	closing: boolean
	send(connection: LiveConnection, message: object): void
	broadcast(message: object, include?: (connection: LiveConnection) => boolean): void
	authorize(connection: LiveConnection): Promise<boolean>
	stop(): Promise<void>
}

// 所有连接共用一份发送、广播和鉴权逻辑，处理器只关心业务命令
export function createPool(fastify: FastifyInstance): LivePool {
	const server = new WebSocketServer({ server: fastify.server, path: '/neon-radio/live', maxPayload: 4096 })
	const connections = new Map<WebSocket, LiveConnection>()
	const pool: LivePool = {
		server,
		connections,
		closing: false,
		send(connection, message) {
			if (connection.socket.readyState !== WebSocket.OPEN) return
			try {
				connection.socket.send(JSON.stringify(message))
			} catch {
				connection.socket.terminate()
			}
		},
		// 只向仍在线的连接广播同一份快照
		broadcast(message, include = () => true) {
			if (pool.closing) return
			const payload = JSON.stringify(message)
			for (const connection of connections.values()) {
				if (connection.socket.readyState !== WebSocket.OPEN || !include(connection)) continue
				try {
					connection.socket.send(payload)
				} catch {
					connection.socket.terminate()
				}
			}
		},
		// true 为已登录管理员；false 时通知失效连接重新扫码
		async authorize(connection) {
			const valid = getSessionStatus().loggedIn && Boolean(await hasBrowserSession(connection.token))
			pool.send(connection, { type: 'radio-auth', data: valid })
			if (valid) {
				connection.authorized = true
				return true
			}
			if (connection.authorized) {
				connection.authorized = false
				pool.send(connection, { type: 'auth-required', message: '登录已失效，请重新扫码登录' })
			}
			return false
		},
		async stop() {
			pool.closing = true
			for (const connection of connections.values()) connection.socket.terminate()
			connections.clear()
			await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
		}
	}
	server.on('error', error => fastify.log.warn({ err: error }, '电台实时管线异常'))
	return pool
}

// 新连接先建立逐连接状态，首帧内容由实时入口发送
export function createConnection(socket: WebSocket, request: IncomingMessage): LiveConnection {
	return {
		socket,
		request,
		token: readTokenCookie(request.headers.cookie),
		authorized: false,
		local: null,
		queue: Promise.resolve(),
		alive: true
	}
}
