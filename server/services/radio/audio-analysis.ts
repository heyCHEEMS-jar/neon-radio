import { EventEmitter } from 'node:events'
import config from '../../config.js'
import { AUDIO_ANALYSIS_VERSION, fetchImpactTimeline, type AudioImpactTimeline } from '../../integrations/audio-analysis.js'
import { readSongImpacts, readSongIdsWithoutImpacts, replaceSongImpacts } from '../../repositories/song-impacts.js'
import { getSessionStatus } from '../session/netease-session.js'
import { getRadioAudio } from './audio.js'
import { roamingSongsEvents, type RadioSong } from './roaming-sync.js'

export const audioAnalysisEvents = new EventEmitter<{ ready: [string] }>()
const timelines = new Map<string, AudioImpactTimeline>()
const pendingSongs = new Map<string, RadioSong>() // 当前分析歌曲也保留在队列中，刷新时不会重复排队
let analysisTask: Promise<void> | null = null
let pendingChecks = Promise.resolve()
let closing = false

// 取链、离线分析并整首入库，缓存只发布已经保存成功的时间轴
async function analyzeSong(song: RadioSong) {
	// 复用电台账号取链，不向分析线程传递 Cookie
	const source = await getRadioAudio(song)
	// 下载和音频算法由集成层处理，服务只保留业务编排
	const timeline = await fetchImpactTimeline(source.src)
	// 持久化成功后再更新公开读取缓存
	await replaceSongImpacts(config.NETEASE_UID, song.id, timeline)
	timelines.set(song.id, timeline)
	// 时间轴落库后通知当前听众重新读取，无需等到下一次切歌
	audioAnalysisEvents.emit('ready', song.id)
	console.info(`[音频分析] 已完成：${song.name}，${timeline.impacts.length} 个时间点`)
}

// 串行分析缺失歌曲，单首失败不影响元数据同步和其余歌曲
async function pumpAudioAnalysis() {
	while (pendingSongs.size) {
		const song = pendingSongs.values().next().value
		if (!song) break
		try {
			await analyzeSong(song)
		} catch (error: unknown) {
			console.warn(`[音频分析] ${song.name} 失败：${error instanceof Error ? error.message : '分析失败'}`)
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

// 元数据入库发布后查缺失或过期的时间轴，未登录时等待下一轮同步
async function enqueueMissingSongs(songs: RadioSong[]) {
	if (closing || !songs.length || !getSessionStatus().loggedIn) return
	const missing = await readSongIdsWithoutImpacts(config.NETEASE_UID, songs.map(song => song.id))
	if (closing) return
	for (const song of songs) {
		if (missing.has(song.id) && timelines.get(song.id)?.analysisVersion !== AUDIO_ANALYSIS_VERSION) pendingSongs.set(song.id, song)
	}
	startAudioAnalysis()
}

// 串行安排入库快照的缺失检查，并保留关闭服务时可等待的任务
function scheduleMissingSongs(songs: RadioSong[]) {
	pendingChecks = pendingChecks.then(() => enqueueMissingSongs(songs)).catch((error: unknown) => {
		console.warn(`[音频分析] 缺失检查失败：${error instanceof Error ? error.message : '数据库请求失败'}`)
	})
}

// 启动前订阅已入库列表，启动加载和每轮漫游同步都补齐缺失时间轴
export function initAudioAnalysis() {
	roamingSongsEvents.on('change', scheduleMissingSongs)
}

// 取消未开始的歌曲，等待在途分析和数据库检查结束后才关闭数据库
export async function closeAudioAnalysis() {
	closing = true
	roamingSongsEvents.off('change', scheduleMissingSongs)
	pendingSongs.clear()
	await Promise.all([pendingChecks, analysisTask])
}

// 读取持久化时间轴，内存缓存避免同一首歌被多个听众重复查库
export async function getSongImpacts(songId: string): Promise<AudioImpactTimeline | null> {
	const cached = timelines.get(songId)
	if (cached) return cached
	const timeline = await readSongImpacts(config.NETEASE_UID, songId)
	if (timeline) timelines.set(songId, timeline)
	return timeline
}
