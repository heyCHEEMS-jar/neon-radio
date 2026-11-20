import { z } from 'zod'

// 服务端提示文案与译文，前端按当前语言渲染
export const messages = {
	'request.invalidPath': { zh: '请求路径不合法', en: 'Invalid request path' },
	'request.badResponse': { zh: '服务端未正常响应（HTTP {status}）', en: 'Unexpected response from the server (HTTP {status})' },
	'request.failed': { zh: '请求失败（HTTP {status}）', en: 'Request failed (HTTP {status})' },
	'request.invalidParams': { zh: '请求参数不合法', en: 'Invalid request parameters' },
	'request.rateLimited': { zh: '请求过于频繁，请 {seconds} 秒后重试', en: 'Too many requests. Try again in {seconds} seconds.' },
	'route.notFound': { zh: '404 未知访问路径', en: '404 Unknown path' },
	'server.internal': { zh: '电台服务内部错误', en: 'Radio service error' },
	'sameOrigin.forbidden': { zh: '不允许跨站请求', en: 'Cross-site requests are not allowed' },
	'auth.loginRequired': { zh: '请先扫码登录电台', en: 'Sign in to the radio first' },
	'auth.checkFailed': { zh: '登录状态检查失败，请重试', en: 'Could not check the sign-in state. Try again.' },
	'auth.sessionExpired': { zh: '登录已失效，请重新扫码登录', en: 'Your session expired. Sign in again with the QR code.' },
	'qr.expired': { zh: '二维码已过期，请重新生成', en: 'The QR code expired. Generate a new one.' },
	'qr.scan': { zh: '请用网易云音乐 App 扫码，并在手机上确认。', en: 'Scan with the NetEase Cloud Music app and confirm on your phone.' },
	'qr.scanned': { zh: '已扫码，请在手机上确认', en: 'Scanned. Confirm on your phone.' },
	'qr.success': { zh: '登录成功', en: 'Signed in' },
	'qr.unknownStatus': { zh: '登录状态异常', en: 'Unexpected sign-in state' },
	'qr.invalidated': { zh: '登录已失效，请重新生成二维码', en: 'Your session expired. Generate a new QR code.' },
	'qr.rateLimited': { zh: '二维码生成过于频繁，请稍后重试', en: 'The QR code was requested too often. Try again later.' },
	'qr.keyRequired': { zh: '请通过查询参数提供二维码 Key', en: 'Provide the QR key as a query parameter' },
	'qr.requestFailed': { zh: '扫码接口请求失败', en: 'The QR sign-in request failed' },
	'qr.invalidResponse': { zh: '二维码数据异常', en: 'Unexpected QR code data' },
	'session.cookieInvalid': { zh: '网易云登录 Cookie 无效', en: 'The NetEase Cloud Music cookie is invalid' },
	'session.uidMismatch': { zh: '扫码账号与电台 UID 不匹配，登录失败', en: 'This account does not match the radio UID' },
	'session.expired': { zh: '网易云登录已失效', en: 'The NetEase Cloud Music session expired' },
	'session.loginFirst': { zh: '请打开登录弹窗扫码登录电台账号', en: 'Sign in to the radio account from the login dialog' },
	'session.updated': { zh: '登录状态已更新，请重试', en: 'The sign-in state changed. Try again.' },
	'roaming.guestDisabled': { zh: '游客自漫游未开启', en: 'Guest roaming is turned off' },
	'roaming.songMissing': { zh: '歌曲已不在漫游列表中', en: 'This song is no longer in the roaming list' },
	'roaming.currentSongMissing': { zh: '当前歌曲已不在漫游列表中', en: 'The current song is no longer in the roaming list' },
	'song.notInRadio': { zh: '歌曲已不在电台列表中', en: 'This song is no longer in the radio list' },
	'playback.invalidDuration': { zh: '歌曲时长无效，暂时无法播放', en: 'This song has no valid duration and cannot be played yet' },
	'playback.currentInvalidDuration': { zh: '当前歌曲时长无效，暂时无法同步', en: 'The current song has no valid duration and cannot be synced' },
	'playback.instanceChanged': { zh: '播放实例已切换', en: 'Playback has already moved on' },
	'playback.songChanged': { zh: '歌曲已切换，请重新调整进度', en: 'The song changed. Adjust the position again.' },
	'playback.nothingToPause': { zh: '当前没有可暂停的歌曲', en: 'There is no song to pause' },
	'playback.requestFailed': { zh: '播放请求处理失败，请稍后重试', en: 'Could not handle the playback request. Try again later.' },
	'playback.nextFailed': { zh: '自动切歌失败', en: 'Could not advance to the next song' },
	'playback.seekFailed': { zh: '播放进度调整失败', en: 'Could not change the playback position' },
	'playback.mainSyncFailed': { zh: '开启主线同步失败，请稍后重试', en: 'Could not enable main-line sync. Try again later.' },
	'sync.busy': { zh: '正在同步网易云数据，请稍后再试', en: 'NetEase sync is already running. Try again later.' },
	'sync.busyRequest': { zh: '正在处理同步请求，请稍后重试', en: 'A sync request is already being handled' },
	'sync.tooFrequent': { zh: '同步数据过于频繁，请 {seconds} 秒后重试', en: 'Syncing too often. Try again in {seconds} seconds.' },
	'sync.checkFailed': { zh: '登录状态检查失败，请稍后重试', en: 'Could not check the sign-in state. Try again later.' },
	'sync.refreshing': { zh: '正在刷新网易云 Cookie…', en: 'Refreshing the NetEase Cloud Music cookie…' },
	'sync.syncing': { zh: 'Cookie 已刷新，正在后台同步歌曲…', en: 'Cookie refreshed. Syncing songs in the background…' },
	'sync.syncingAfterRefreshFailed': {
		zh: 'Cookie 刷新失败，正在后台同步歌曲…',
		en: 'Cookie refresh failed. Syncing songs in the background anyway…'
	},
	'sync.pending': { zh: '正在同步歌曲，请稍后再试', en: 'Songs are syncing. Try again later.' },
	'sync.pendingAfterRefreshFailed': {
		zh: 'Cookie 刷新失败：{error}；正在同步歌曲，请稍后再试',
		en: 'Cookie refresh failed: {error}. Songs are syncing, try again later.'
	},
	'sync.summary': {
		zh: '已读取 {playlists} 个歌单、{songs} 首歌曲，去重后入库 {stored} 首，本次获取 {fetched} 首详情',
		en: 'Read {playlists} playlists and {songs} songs, stored {stored} after de-duplication, fetched {fetched} song details'
	},
	'sync.summaryAfterRefreshFailed': { zh: 'Cookie 刷新失败：{error}；{summary}', en: 'Cookie refresh failed: {error}. {summary}' },
	'sync.failed': { zh: '歌曲同步失败，保留上次列表：{error}', en: 'Song sync failed, keeping the previous list: {error}' },
	'sync.failedAfterRefreshFailed': { zh: 'Cookie 刷新失败：{error}；{detail}', en: 'Cookie refresh failed: {error}. {detail}' },
	'upstream.expired': {
		zh: '网易云登录已失效，请重新扫码',
		en: 'The NetEase Cloud Music session expired. Scan the QR code again.'
	},
	'upstream.forbidden': { zh: '网易云拒绝访问该资源', en: 'NetEase Cloud Music denied access to this resource' },
	'upstream.failed': { zh: '网易云请求失败，请稍后重试', en: 'The NetEase Cloud Music request failed. Try again later.' },
	'upstream.expiredSync': {
		zh: '网易云登录已失效，请重新登录',
		en: 'The NetEase Cloud Music session expired. Sign in again.'
	},
	'upstream.forbiddenSync': {
		zh: '网易云拒绝访问，请重新登录或稍后重试',
		en: 'NetEase Cloud Music denied access. Sign in again or try later.'
	},
	'upstream.failedSync': { zh: '请求网易云失败，请稍后重试', en: 'The NetEase Cloud Music request failed. Try again later.' },
	'audio.noSource': { zh: '当前歌曲暂无可播放音源', en: 'No playable audio for this song yet' },
	'audio.requestFailed': { zh: '音源请求失败', en: 'The audio request failed' },
	'audio.trial': { zh: '当前歌曲为试听版本', en: 'This song is only available as a preview' },
	'audio.startFailed': { zh: '播放未能启动，请再次点击播放', en: 'Playback did not start. Press play again.' },
	'audio.mediaFailed': {
		zh: '音源播放失败，请重试；请确认曲源权限及浏览器跨域支持',
		en: 'Audio playback failed. Check the source permission and browser cross-origin support, then retry.'
	},
	'audio.noSongs': { zh: '电台暂无歌曲，请先登录并同步歌单', en: 'The radio has no songs yet. Sign in and sync the playlist first.' },
	'audio.initFailed': { zh: '音频初始化失败，请重试', en: 'Audio setup failed. Try again.' },
	'audio.locked': { zh: '音频未能解锁，请再次点击播放', en: 'Audio could not be unlocked. Press play again.' },
	'audio.invalidDuration': { zh: '当前音源时长无效', en: 'The audio has no valid duration' },
	'audio.invalidUrl': { zh: '音源地址异常', en: 'The audio link is invalid' },
	'impacts.pending': { zh: '歌曲震动时间轴尚未分析', en: 'The vibration timeline has not been analyzed yet' }
} as const

export type MessageKey = keyof typeof messages

export type Locale = 'zh' | 'en'

// 参数允许嵌套提示，便于组合“Cookie 刷新失败：…”这类多段说明
export type MessageParam = string | number | ServerMessage

export interface ServerMessage {
	key: MessageKey
	params?: Record<string, MessageParam> | undefined
}

// 填充 {name} 占位符，缺失的参数保留原文；嵌套提示由调用方传入渲染方式
export function interpolate(text: string, params: Record<string, MessageParam> | undefined, render: (value: MessageParam) => string): string {
	if (!params) return text
	return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
		const value = params[name]
		return value === undefined ? placeholder : render(value)
	})
}

// 按语言渲染提示，嵌套参数递归展开
export function formatMessage(message: ServerMessage, locale: Locale): string {
	const entry: { zh: string; en: string } | undefined = messages[message.key]
	const text = entry?.[locale] ?? entry?.zh ?? message.key
	return interpolate(text, message.params, value => (typeof value === 'object' ? formatMessage(value, locale) : String(value)))
}

const messageParamSchema: z.ZodType<MessageParam> = z.union([z.string(), z.number(), z.lazy(() => serverMessageSchema)])

// 只校验非空字符串，未知 key 原样显示，不丢弃整条消息
const messageKeySchema = z.custom<MessageKey>(value => typeof value === 'string' && value.length > 0)

export const serverMessageSchema: z.ZodType<ServerMessage> = z.object({
	key: messageKeySchema,
	params: z.record(z.string(), messageParamSchema).optional()
})


// 前后端共用的普通对象判定，排除数组和 null
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 所有业务接口共用的响应信封，错误分支只带 message
export interface ApiResponse<T = unknown> {
	code: number
	message?: ServerMessage
	data?: T
}

export interface RadioAudioSource {
	src: string
	durationMs: number
	// 试听边界，单位秒；完整权益歌曲为 null
	trial: { start: number; end: number } | null
}

export interface AudioImpact {
	timeMs: number
	strength: number
}

export interface AudioTimeline {
	analysisVersion: number
	durationMs: number
	impacts: AudioImpact[]
}

// 歌词按行下发，timeMs 对应歌曲播放位置
export interface LyricLine {
	timeMs: number
	text: string
	translation: string | null
}

// 网易云标注的副歌区间，未标注时为 null
export interface ChorusRange {
	startMs: number
	endMs: number
}

// 歌曲卡片：服务端入库、接口下发、前端渲染共用同一份字段
export const radioSongSchema = z.object({
	id: z.string(),
	name: z.string(),
	artists: z.array(z.string()),
	picUrl: z.string(),
	durationMs: z.number().int().nonnegative()
})
export type RadioSong = z.infer<typeof radioSongSchema>

// 播放顺序同时用于服务端选歌和前端管理员设置
export const playbackOrderSchema = z.enum(['random', 'sequential', 'single'])
export type PlaybackOrder = z.infer<typeof playbackOrderSchema>

// 原生下拉框和实时消息共用同一份播放顺序判定
export function isPlaybackOrder(value: unknown): value is PlaybackOrder {
	return playbackOrderSchema.safeParse(value).success
}

export const radioOptionsSchema = z.object({
	guestRoamingEnabled: z.boolean(),
	forceMainPlaybackSyncEnabled: z.boolean(),
	playbackOrder: playbackOrderSchema
})
export type RadioOptions = z.infer<typeof radioOptionsSchema>
export type RadioOptionKey = keyof RadioOptions

// 播放快照：主线与本地连接共用，paused 只对本地播放有意义
export const playbackSnapshotSchema = z
	.object({
		mode: z.enum(['main', 'local']),
		song: radioSongSchema.nullable(),
		playbackId: z.string().nullable(),
		positionMs: z.number().finite().nonnegative(),
		paused: z.boolean().optional()
	})
	.refine(value => (value.song === null) === (value.playbackId === null) && (value.mode === 'main' || value.song !== null))
export type PlaybackSnapshot = z.infer<typeof playbackSnapshotSchema>

// 前端在快照上补充接收时间，用来推算主线当前进度
export interface PlaybackState extends PlaybackSnapshot {
	receivedAt: number
	paused: boolean
}

// 网易云同步任务状态，手动刷新期间由实时连接广播
export const neteaseSyncStateSchema = z.object({
	id: z.string(),
	phase: z.enum(['refreshing', 'syncing', 'success', 'error']),
	message: serverMessageSchema
})
export type NeteaseSyncState = z.infer<typeof neteaseSyncStateSchema>

// 在线连接数，以及正在播放的连接按歌曲分组；本地播放优先，其余跟随主线
export const radioListenersSchema = z.object({
	online: z.number().int().nonnegative(),
	songs: z.array(z.object({ songId: z.string(), listeners: z.number().int().nonnegative() }))
})
export type RadioListeners = z.infer<typeof radioListenersSchema>

// 请求 ID 由前端生成，服务端原样带回，用于确认同一次操作
export const requestIdSchema = z.string().regex(/^[a-zA-Z0-9-]{1,64}$/)

const playbackRequestSchema = z.discriminatedUnion('mode', [
	z.strictObject({ type: z.literal('playback-request'), requestId: requestIdSchema, mode: z.literal('main') }),
	z
		.strictObject({
			type: z.literal('playback-request'),
			requestId: requestIdSchema,
			mode: z.literal('local'),
			songId: z.string().min(1),
			playbackId: z.string().min(1).optional(),
			positionMs: z.number().finite().nonnegative().optional(),
			paused: z.boolean().optional()
		})
		// 恢复播放必须同时给出实例和进度，普通点歌只给歌曲 ID
		.refine(value => value.playbackId === undefined || value.positionMs !== undefined)
])

const playbackSeekRequestSchema = z.strictObject({
	type: z.literal('playback-seek-request'),
	requestId: requestIdSchema,
	mode: z.literal('local'),
	sourceMode: z.enum(['main', 'local']),
	playbackId: z.string().min(1),
	positionMs: z.number().finite().nonnegative(),
	paused: z.boolean()
})

const playbackNextRequestSchema = z.strictObject({
	type: z.literal('playback-next-request'),
	requestId: requestIdSchema,
	mode: z.literal('local'),
	playbackId: z.string().min(1),
	order: playbackOrderSchema.optional(),
	manual: z.boolean().optional()
})

const playbackPauseRequestSchema = z.strictObject({
	type: z.literal('playback-pause-request'),
	requestId: requestIdSchema,
	mode: z.literal('local')
})

const mainSyncRequestSchema = z.strictObject({
	type: z.literal('main-sync-request'),
	requestId: requestIdSchema,
	mode: z.literal('main'),
	playback: z.union([z.strictObject({ songId: z.string().min(1).max(64), positionMs: z.number().finite().nonnegative() }), z.null()])
})

const neteaseSyncRequestSchema = z.strictObject({
	type: z.literal('netease-sync-request'),
	requestId: requestIdSchema
})

// 浏览器上报真实播放状态，用于统计每首歌的在听人数
const presenceCommandSchema = z.strictObject({
	type: z.literal('presence'),
	playing: z.boolean()
})

// 浏览器发往服务端的全部实时指令
export const liveCommandSchema = z.union([
	playbackRequestSchema,
	playbackSeekRequestSchema,
	playbackNextRequestSchema,
	playbackPauseRequestSchema,
	mainSyncRequestSchema,
	neteaseSyncRequestSchema,
	presenceCommandSchema
])
export type LiveCommand = z.infer<typeof liveCommandSchema>

// 服务端发往浏览器的全部实时消息
export const liveEventSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('radio-auth'), data: z.boolean() }),
	z.object({ type: z.literal('radio-options'), data: radioOptionsSchema }),
	z.object({ type: z.literal('radio-songs'), data: z.array(radioSongSchema) }),
	z.object({ type: z.literal('radio-impacts-ready'), data: z.string() }),
	z.object({ type: z.literal('playback-state'), data: playbackSnapshotSchema }),
	z.object({
		type: z.literal('playback-response'),
		requestId: requestIdSchema,
		code: z.number().int(),
		message: serverMessageSchema.optional(),
		mode: z.enum(['main', 'local']).optional(),
		data: playbackSnapshotSchema.optional()
	}),
	z.object({ type: z.literal('netease-sync'), data: neteaseSyncStateSchema.nullable(), snapshot: z.boolean() }),
	z.object({ type: z.literal('netease-sync-response'), requestId: requestIdSchema, code: z.number().int(), message: serverMessageSchema.optional() }),
	z.object({ type: z.literal('radio-listeners'), data: radioListenersSchema }),
	z.object({ type: z.literal('auth-required'), message: serverMessageSchema })
])
export type LiveEvent = z.infer<typeof liveEventSchema>
