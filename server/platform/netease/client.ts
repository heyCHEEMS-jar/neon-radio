import { isRecord } from '@neon-radio/protocol'
import api from '../../vendor/ncm-api/main.js'
import type * as NcmApi from '../../vendor/ncm-api/interface.js'
import { UpstreamError } from '../errors.js'

// 只暴露业务用到的接口，vendor 目录本身不做修改
export const ncmApi: Pick<
	typeof NcmApi,
	| 'user_playlist'
	| 'playlist_detail'
	| 'playlist_track_all'
	| 'song_detail'
	| 'song_url_v1'
	| 'lyric'
	| 'login_status'
	| 'login_refresh'
	| 'login_qr_key'
	| 'login_qr_create'
	| 'login_qr_check'
> = {
	user_playlist: api.user_playlist,
	playlist_detail: api.playlist_detail,
	playlist_track_all: api.playlist_track_all,
	song_detail: api.song_detail,
	song_url_v1: api.song_url_v1,
	lyric: api.lyric,
	login_status: api.login_status,
	login_refresh: api.login_refresh,
	login_qr_key: api.login_qr_key,
	login_qr_create: api.login_qr_create,
	login_qr_check: api.login_qr_check
}

export const ncmOptions = { timeout: 10_000 }

// 默认请求超清母带，实际可用音质由网易云曲源和当前账号权限决定
export function requestSongUrl(id: string, cookie: string): Promise<NcmApi.Response> {
	return ncmApi.song_url_v1({ ...ncmOptions, id, level: 'jymaster' as NcmApi.SoundQualityType, cookie })
}

// 上游错误统一归类，业务层和路由只关心 expired/forbidden/unavailable
export function upstreamError(response: { body: unknown }, fallback = '网易云请求失败') {
	const body = isRecord(response.body) ? response.body : undefined
	const data = isRecord(body?.data) ? body.data : undefined
	const code = body?.code ?? data?.code
	if (code === 301 || code === 401) return new UpstreamError('expired', '网易云登录已失效，请重新扫码')
	if (code === 403) return new UpstreamError('forbidden', '网易云拒绝访问，请重新登录或稍后重试')
	return new UpstreamError('unavailable', fallback)
}

// 非 200 直接转成带类别的上游错误，不再把原始响应对象抛给上层
export function requireOk<T extends { body: { code: number } }>(response: T, message = '网易云请求失败'): T {
	if (response.body.code !== 200) throw upstreamError(response, message)
	return response
}
