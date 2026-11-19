import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { getAudioDuration, getRadioAudio } from './audio.js'
import { getRadioOptions } from './options.js'
import { getRoamingSongs, roamingSongsEvents, type RadioSong } from './roaming-sync.js'

export interface PlaybackSnapshot {
	mode: 'main' | 'local'
	song: RadioSong | null
	playbackId: string | null
	positionMs: number
	paused?: boolean
}

interface MainPlayback {
	song: RadioSong // 保留原歌曲元数据，音源变化时仍能重新取链
	duration: number // 实际可播时长，试听按短曲计时
	playbackId: string
	startedAt: number
}

export const playbackEvents = new EventEmitter<{ change: [PlaybackSnapshot] }>()
let songs: RadioSong[] = [] // 最新有效播放列表
let current: MainPlayback | null = null // 主线唯一播放实例
let pendingMainSong: RadioSong | null = null // 防抖期间最后一次管理员选歌
let songTimer: ReturnType<typeof setTimeout> | null = null // 当前音源结束时自动切歌
let calibrationTimer: ReturnType<typeof setInterval> | null = null // 主线低频进度校准
let mainPlaybackTimer: ReturnType<typeof setTimeout> | null = null // 管理员操作的防抖计时器

// 主线和本地共用播放顺序，随机模式有多首时不连续重复当前曲
export function getNextSong(song: RadioSong | null) {
	if (!songs.length) return null
	const index = songs.findIndex(item => item.id === song?.id)
	const order = getRadioOptions().playbackOrder
	if (songs.length === 1 || (order === 'single' && index >= 0)) return songs[Math.max(0, index)] ?? null
	if (order !== 'random') return songs[(index + 1) % songs.length] ?? null
	const count = songs.length - (index >= 0 ? 1 : 0) // 从当前曲之外均匀随机选一首
	let next = Math.floor(Math.random() * count)
	if (index >= 0 && next >= index) next += 1
	return songs[next] ?? null
}

// 新播放实例优先采用已解析的音源时长，避免试听重播时退回全曲时长
function createMainPlayback(song: RadioSong, startedAt: number): MainPlayback {
	const metadata = songs.find(item => item.id === song.id) ?? song // 不把试听快照中的短时长当成原曲元数据
	return { song: metadata, duration: getAudioDuration(metadata), playbackId: randomUUID(), startedAt }
}

// 按经过时间定位主线，定时器延迟不会累积成进度误差
function advance(now: number) {
	if (!current) {
		const song = getNextSong(null)
		if (song) current = createMainPlayback(song, now)
		return
	}
	let elapsed = now - current.startedAt // 当前音源已走过的时间
	if (elapsed < current.duration) return
	elapsed -= current.duration
	if (!songs.length) {
		current = null
		return
	}
	const order = getRadioOptions().playbackOrder
	if (order === 'single' && songs.some(song => song.id === current?.song.id)) {
		current = { ...current, playbackId: randomUUID(), startedAt: now - (elapsed % current.duration) }
		return
	}
	if (order === 'random') {
		let next = getNextSong(current.song)
		while (next && elapsed >= getAudioDuration(next)) {
			elapsed -= getAudioDuration(next)
			next = getNextSong(next)
		}
		current = next ? createMainPlayback(next, now - elapsed) : null
		return
	}
	let index = (songs.findIndex(song => song.id === current?.song.id) + 1) % songs.length
	elapsed %= songs.reduce((total, song) => total + getAudioDuration(song), 0)
	let next = songs[index]
	if (!next) return
	while (elapsed >= getAudioDuration(next)) {
		elapsed -= getAudioDuration(next)
		index = (index + 1) % songs.length
		next = songs[index]
		if (!next) return
	}
	current = createMainPlayback(next, now - elapsed)
}

// 返回主线可播时长和逻辑进度，试听不再按原歌曲总时长显示
function snapshot(): PlaybackSnapshot {
	return {
		mode: 'main',
		song: current ? { ...current.song, duration: current.duration } : null,
		playbackId: current?.playbackId ?? null,
		positionMs: current ? Math.min(current.duration, Math.max(0, performance.now() - current.startedAt)) : 0
	}
}

// 音源解析后校准真实时长；旧歌曲的异步结果不得覆盖新播放实例
function prepareCurrent() {
	const target = current // 本次解析对应的播放实例
	if (!target) return
	void getRadioAudio(target.song)
		.then(source => {
			if (current !== target || source.durationMs === target.duration) return
			current = { ...target, duration: source.durationMs, playbackId: randomUUID(), startedAt: performance.now() }
			publish()
		})
		.catch(() => {
			// 未登录或音源不可用由取链接口反馈，不阻止电台启动和重新登录
		})
}

// 按当前音源剩余时长安排切歌，试听结束同样进入下一首
function scheduleNext() {
	if (songTimer) clearTimeout(songTimer)
	songTimer = null
	if (!current || !calibrationTimer) return
	songTimer = setTimeout(publish, Math.max(1, current.duration - (performance.now() - current.startedAt)))
	songTimer.unref()
}

// 推进主线、重排结束计时并广播，再共用缓存准备当前音源
function publish() {
	advance(performance.now())
	scheduleNext()
	playbackEvents.emit('change', snapshot())
	prepareCurrent()
}

// 应用最后一次管理员操作，回主线不重置原来的歌曲和进度
function applyPendingMainPlayback() {
	const song = pendingMainSong
	pendingMainSong = null
	mainPlaybackTimer = null
	if (song) current = createMainPlayback(song, performance.now())
	publish()
}

// 服务端等待操作停止 300ms；null 表示回主线，覆盖待执行的选歌
export function scheduleMainPlayback(song: RadioSong | null) {
	pendingMainSong = song
	if (mainPlaybackTimer) clearTimeout(mainPlaybackTimer)
	mainPlaybackTimer = setTimeout(applyPendingMainPlayback, 300)
	mainPlaybackTimer.unref()
}

// 关闭同步、接管主线或停止服务时取消待执行操作
export function cancelScheduledMainPlayback() {
	if (mainPlaybackTimer) clearTimeout(mainPlaybackTimer)
	mainPlaybackTimer = null
	pendingMainSong = null
}

// 管理员接管当前歌曲和逻辑进度，不另外创建音源播放循环
export function syncMainPlayback(song: RadioSong | null, positionMs: number) {
	cancelScheduledMainPlayback()
	if (song) current = createMainPlayback(song, performance.now() - positionMs)
	publish()
	return snapshot()
}

// 新连接和回主线取得此刻快照，同时确保音源和结束计时已安排
export function getMainPlayback() {
	advance(performance.now())
	scheduleNext()
	prepareCurrent()
	return snapshot()
}

// 本地确认前解析音源，试听快照从一开始就采用真实短曲时长
export async function createLocalPlayback(
	song: RadioSong,
	state: Partial<Pick<PlaybackSnapshot, 'playbackId' | 'positionMs' | 'paused'>> = {}
): Promise<PlaybackSnapshot> {
	const metadata = songs.find(item => item.id === song.id) ?? song
	const source = await getRadioAudio(metadata)
	return {
		mode: 'local',
		song: { ...metadata, duration: source.durationMs },
		playbackId: state.playbackId ?? randomUUID(),
		positionMs: Math.min(source.durationMs, state.positionMs ?? 0),
		paused: state.paused ?? false
	}
}

// 列表更新不打断当前音源，下一次切歌使用最新列表
function updateSongs(nextSongs: RadioSong[]) {
	songs = nextSongs.filter(song => Number.isFinite(song.duration) && song.duration > 0)
	if (!current) publish()
	else prepareCurrent()
}

// 启动主线时钟并监听歌曲列表
export function initRadioPlayback() {
	if (calibrationTimer) return
	roamingSongsEvents.on('change', updateSongs)
	calibrationTimer = setInterval(publish, 30_000)
	calibrationTimer.unref()
	updateSongs(getRoamingSongs())
}

// 停止主线并释放计时器和列表订阅
export function closeRadioPlayback() {
	if (songTimer) clearTimeout(songTimer)
	if (calibrationTimer) clearInterval(calibrationTimer)
	cancelScheduledMainPlayback()
	roamingSongsEvents.off('change', updateSongs)
	songTimer = null
	calibrationTimer = null
	songs = []
	current = null
}
