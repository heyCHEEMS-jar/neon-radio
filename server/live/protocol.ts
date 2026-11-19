import type { LiveCommand } from '@neon-radio/protocol'
import { liveCommandSchema } from '@neon-radio/protocol'

// 浏览器指令只接受协议包定义的结构，格式错误由入口层断开连接
export function parseCommand(payload: string): LiveCommand | null {
	let message: unknown
	try {
		message = JSON.parse(payload)
	} catch {
		return null
	}
	const parsed = liveCommandSchema.safeParse(message)
	return parsed.success ? parsed.data : null
}
