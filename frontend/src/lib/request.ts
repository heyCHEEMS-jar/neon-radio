import type { ApiResponse } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'
import { ApiError, readServerMessage } from './api-error'

export async function request<T = unknown>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
	const response = await fetch(path, { cache: 'no-store', ...init })
	const result: unknown = await response.json().catch(() => null)
	if (!isRecord(result) || typeof result.code !== 'number')
		throw new ApiError({ key: 'request.badResponse', params: { status: response.status } })
	if (!response.ok) throw new ApiError(readServerMessage(result.message) ?? { key: 'request.failed', params: { status: response.status } })
	return result as unknown as ApiResponse<T>
}
