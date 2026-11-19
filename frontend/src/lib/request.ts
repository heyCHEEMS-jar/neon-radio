import type { ApiResponse } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'

// 统一请求本站业务接口：非 JSON 或非 2xx 直接抛错，业务 code 交给调用方判断
export async function request<T = unknown>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
	const response = await fetch(path, { cache: 'no-store', ...init })
	const result: unknown = await response.json().catch(() => null)
	if (!isRecord(result) || typeof result.code !== 'number') throw new Error(`服务端未正常响应（HTTP ${response.status}）`)
	if (!response.ok) throw new Error(typeof result.message === 'string' ? result.message : `请求失败（HTTP ${response.status}）`)
	return result as unknown as ApiResponse<T>
}
