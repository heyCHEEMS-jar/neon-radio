import { z } from 'zod'

// 前后端共用的普通对象判定，排除数组和 null
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 所有业务接口共用的响应信封，错误分支只带 message
export interface ApiResponse<T = unknown> {
	code: number
	message?: string
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
	message: z.string()
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
		message: z.string().optional(),
		mode: z.enum(['main', 'local']).optional(),
		data: playbackSnapshotSchema.optional()
	}),
	z.object({ type: z.literal('netease-sync'), data: neteaseSyncStateSchema.nullable(), snapshot: z.boolean() }),
	z.object({ type: z.literal('netease-sync-response'), requestId: requestIdSchema, code: z.number().int(), message: z.string().optional() }),
	z.object({ type: z.literal('radio-listeners'), data: radioListenersSchema }),
	z.object({ type: z.literal('auth-required'), message: z.string() })
])
export type LiveEvent = z.infer<typeof liveEventSchema>
