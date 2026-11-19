// 业务错误：入口层直接按 status/code 输出，不再猜测上游对象结构
export class AppError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code = status
	) {
		super(message)
		this.name = 'AppError'
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
