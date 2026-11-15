import api from '../ncm-api/main.js'
import type * as NcmApi from '../ncm-api/interface.js'

export const ncmApi: Pick<
	typeof NcmApi,
	'user_playlist' | 'playlist_track_all' | 'login_status' | 'login_refresh' | 'login_qr_key' | 'login_qr_create' | 'login_qr_check'
> = {
	user_playlist: api.user_playlist,
	playlist_track_all: api.playlist_track_all,
	login_status: api.login_status,
	login_refresh: api.login_refresh,
	login_qr_key: api.login_qr_key,
	login_qr_create: api.login_qr_create,
	login_qr_check: api.login_qr_check
}
export const ncmOptions = { timeout: 10_000 }

export class ApiError extends Error {
	constructor(
		readonly statusCode: number,
		message: string,
		readonly code = statusCode
	) {
		super(message)
		this.name = 'ApiError'
	}
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}
