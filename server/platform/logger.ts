export interface Logger {
	info(message: string): void
	warn(message: string): void
	error(message: string): void
}

// 后台任务没有请求上下文，用统一的模块前缀替代散落的 console 字符串
export function createLogger(tag: string): Logger {
	return {
		info: message => console.info(`[${tag}] ${message}`),
		warn: message => console.warn(`[${tag}] ${message}`),
		error: message => console.error(`[${tag}] ${message}`)
	}
}
