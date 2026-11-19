import config from '../../config.js'
import { fetchBassEnvelope } from '../../integrations/audio-analysis.js'
import { readSongEnergy, readSongIdsWithoutEnergy, replaceSongEnergy, type SongEnergy } from '../../repositories/song-energy.js'
import { getSessionStatus } from '../session/netease-session.js'
import { getRadioAudio } from './audio.js'
import { roamingSongsEvents, type RadioSong } from './roaming-sync.js'

const energies = new Map<string, SongEnergy>() // 歌曲包络内存缓存，路由读取不再查库
let pendingSongs: RadioSong[] = [] // 待分析队列，同一首歌不重复排队
let pumping = false

// 取链并分析单首歌，成功后写入数据库并更新缓存
async function analyzeSong(song: RadioSong) {
	const source = await getRadioAudio(song) // 复用电台取链，试听歌只分析可播片段
	const { sampleRate, envelope } = await fetchBassEnvelope(source.src)
	const energy: SongEnergy = { sampleRate, envelope }
	await replaceSongEnergy(config.NETEASE_UID, song.id, energy)
	energies.set(song.id, energy)
}

// 串行消费分析队列，单首失败只记录并继续下一首
async function pumpEnergyAnalysis() {
	while (pendingSongs.length) {
		const song = pendingSongs.shift()
		if (!song) break
		try {
			await analyzeSong(song)
			console.info(`[包络分析] 已完成：${song.name}`)
		} catch (error: unknown) {
			console.warn(`[包络分析] ${song.name} 失败：${error instanceof Error ? error.message : '分析未知异常'}`)
		}
	}
	pumping = false
}

// 批量安排缺失包络的歌曲，先查库去重再入队
async function enqueueMissingSongs(songs: RadioSong[]) {
	if (!songs.length || !getSessionStatus().loggedIn) return // 未登录时取不到音源，等下次歌单发布再检查
	const missing = await readSongIdsWithoutEnergy(config.NETEASE_UID, songs.map(song => song.id))
	const queued = new Set(pendingSongs.map(song => song.id))
	for (const song of songs) {
		if (!missing.has(song.id) || queued.has(song.id)) continue
		queued.add(song.id)
		pendingSongs.push(song)
	}
	if (pendingSongs.length && !pumping) {
		pumping = true
		void pumpEnergyAnalysis()
	}
}

// 歌单每次入库发布后检查缺失包络，检查失败不影响已入库的同步结果
export function initEnergyAnalysis() {
	roamingSongsEvents.on('change', songs =>
		enqueueMissingSongs(songs).catch(error => {
			console.warn(`[包络分析] 缺失检查失败：${error instanceof Error ? error.message : '数据库请求失败'}`)
		})
	)
}

// 路由读取包络，优先内存缓存，冷启动回源数据库
export async function getSongEnergy(songId: string): Promise<SongEnergy | null> {
	const cached = energies.get(songId)
	if (cached) return cached
	const energy = await readSongEnergy(config.NETEASE_UID, songId)
	if (energy) energies.set(songId, energy)
	return energy
}
