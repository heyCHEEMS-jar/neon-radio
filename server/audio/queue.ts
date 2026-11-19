import { EventEmitter } from 'node:events'
import type { AudioTimeline } from '@neon-radio/protocol'
import config from '../config.js'
import { createLogger } from '../platform/logger.js'
import { AUDIO_ANALYSIS_VERSION, fetchImpactTimeline } from './analyze.js'
import { deleteUnreferencedTimelines, findMissingTimelineIds, readTimelineRow, saveTimelineRow } from './store.js'

export interface AudioSongRef {
	id: string
	name: string
	durationMs: number
}

export type AudioSourceResolver = (song: AudioSongRef) => Promise<string>

const logger = createLogger('音频分析')
const timelines = new Map<string, AudioTimeline>()
const pendingSongs = new Map<string, AudioSongRef>()
export const timelineEvents = new EventEmitter<{ ready: [string] }>()

let resolveSrc: AudioSourceResolver | null = null
let analysisTask: Promise<void> | null = null
let pendingChecks = Promise.resolve()
let currentSongIds: Set<string> | null = null
let closing = false

// 取链由业务层注入，黑盒内部不感知会话和权限
export function setSourceResolver(resolver: AudioSourceResolver) {
	resolveSrc = resolver
}

// 取链、离线分析并整首入库，缓存只发布已经保存成功的时间轴
async function analyzeSong(song: AudioSongRef) {
	if (!resolveSrc) throw new Error('音频分析尚未初始化')
	// 排队或分析期间歌曲可能已被移出漫游列表
	if (currentSongIds && !currentSongIds.has(song.id)) return
	const source = await resolveSrc(song)
	const timeline = await fetchImpactTimeline(source)
	if (currentSongIds && !currentSongIds.has(song.id)) return
	await saveTimelineRow(config.NETEASE_UID, song.id, timeline)
	timelines.set(song.id, timeline)
	// 时间轴落库后通知当前听众重新读取，无需等到下一次切歌
	timelineEvents.emit('ready', song.id)
	logger.info(`已完成：${song.name}，${timeline.impacts.length} 个时间点`)
}

// 串行分析缺失歌曲，单首失败不影响元数据同步和其余歌曲
async function pumpAudioAnalysis() {
	while (pendingSongs.size) {
		const song = pendingSongs.values().next().value
		if (!song) break
		try {
			await analyzeSong(song)
		} catch (error: unknown) {
			logger.warn(`${song.name} 失败：${error instanceof Error ? error.message : '分析失败'}`)
		} finally {
			pendingSongs.delete(song.id)
		}
	}
}

// 保持唯一分析任务，补接任务结束边界新加入的歌曲
function startAudioAnalysis() {
	if (closing || analysisTask || !pendingSongs.size) return
	analysisTask = pumpAudioAnalysis().finally(() => {
		analysisTask = null
		startAudioAnalysis()
	})
}

// 入参必须是当前完整漫游列表：先清下线歌曲，再查缺失或过期的时间轴
async function enqueueMissingSongs(songs: readonly AudioSongRef[]) {
	if (closing) return
	const keep = new Set(songs.map(song => song.id))
	currentSongIds = keep
	// 内存缓存和待分析队列同步剔除已下线的歌曲
	for (const songId of timelines.keys()) {
		if (!keep.has(songId)) timelines.delete(songId)
	}
	for (const songId of pendingSongs.keys()) {
		if (!keep.has(songId)) pendingSongs.delete(songId)
	}
	const removed = await deleteUnreferencedTimelines(config.NETEASE_UID, keep)
	if (removed) logger.info(`已清理 ${removed} 条不再引用的时间轴`)
	if (closing || !songs.length) return
	const missing = await findMissingTimelineIds(
		config.NETEASE_UID,
		songs.map(song => song.id),
		AUDIO_ANALYSIS_VERSION
	)
	if (closing) return
	for (const song of songs) {
		if (missing.has(song.id) && timelines.get(song.id)?.analysisVersion !== AUDIO_ANALYSIS_VERSION) pendingSongs.set(song.id, song)
	}
	startAudioAnalysis()
}

// 串行安排缺失检查，并保留关闭服务时可等待的任务
export function queueMissingSongs(songs: readonly AudioSongRef[]) {
	pendingChecks = pendingChecks.then(() => enqueueMissingSongs(songs)).catch((error: unknown) => {
		logger.warn(`缺失检查失败：${error instanceof Error ? error.message : '数据库请求失败'}`)
	})
}

// 读取持久化时间轴，内存缓存避免同一首歌被多个听众重复查库
export async function getTimeline(songId: string): Promise<AudioTimeline | null> {
	const cached = timelines.get(songId)
	if (cached) return cached
	const timeline = await readTimelineRow(config.NETEASE_UID, songId)
	if (timeline) timelines.set(songId, timeline)
	return timeline
}

// 取消未开始的歌曲，等待在途分析和数据库检查结束后才关闭数据库
export async function closeAudioAnalysis() {
	closing = true
	pendingSongs.clear()
	await Promise.all([pendingChecks, analysisTask])
}
