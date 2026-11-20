import type { ServerMessage } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'

// 携带服务端消息键的请求错误，渲染时按当前语言翻译
export class ApiError extends Error {
	constructor(readonly serverMessage: ServerMessage) {
		super(serverMessage.key)
		this.name = 'ApiError'
	}
}

// 服务端错误信封里的消息字段，格式不符时返回 null 由调用方兜底
export function readServerMessage(value: unknown): ServerMessage | null {
	return isRecord(value) && typeof value.key === 'string' ? (value as unknown as ServerMessage) : null
}

// 未知错误按调用方给出的兜底提示处理
export function messageOf(error: unknown, fallback: ServerMessage): ServerMessage {
	return error instanceof ApiError ? error.serverMessage : fallback
}
