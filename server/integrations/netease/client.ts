import api from '../../ncm-api/main.js'
import type * as NcmApi from '../../ncm-api/interface.js'

export const ncmApi: Pick<
	typeof NcmApi,
	| 'user_playlist'
	| 'playlist_detail'
	| 'playlist_track_all'
	| 'song_detail'
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
	login_status: api.login_status,
	login_refresh: api.login_refresh,
	login_qr_key: api.login_qr_key,
	login_qr_create: api.login_qr_create,
	login_qr_check: api.login_qr_check
}
export const ncmOptions = { timeout: 10_000 }
