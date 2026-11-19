import type { LiveEvent } from '@neon-radio/protocol'
import { liveEventSchema } from '@neon-radio/protocol'

// 服务端消息只接受协议包定义的结构，格式异常由调用方断开重连
export function parseLiveEvent(data: string): LiveEvent | null {
	try {
		const parsed = liveEventSchema.safeParse(JSON.parse(data))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}
