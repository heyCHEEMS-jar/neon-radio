import { formatMessage, type ServerMessage } from '@neon-radio/protocol'

// 业务错误：入口层直接按 status/code 输出，不再猜测上游对象结构；message 为中文原文供日志
export class AppError extends Error {
	readonly serverMessage: ServerMessage

	constructor(
		readonly status: number,
		message: ServerMessage,
		readonly code = status
	) {
		super(formatMessage(message, 'zh'))
		this.name = 'AppError'
		this.serverMessage = message
	}
}

// 第三方错误只保留可判定的类别，原始响应留在 cause 中供排查
export type UpstreamErrorKind = 'expired' | 'forbidden' | 'unavailable' | 'unknown'

export class UpstreamError extends Error {
	readonly kind: UpstreamErrorKind

	constructor(kind: UpstreamErrorKind, message: string, cause?: unknown) {
		super(message, cause === undefined ? undefined : { cause })
		this.name = 'UpstreamError'
		this.kind = kind
	}
}

// 限流插件抛出的错误，携带可本地化的提示和 429 状态码
export class RateLimitError extends Error {
	readonly statusCode = 429

	constructor(readonly serverMessage: ServerMessage) {
		super(formatMessage(serverMessage, 'zh'))
		this.name = 'RateLimitError'
	}
}
