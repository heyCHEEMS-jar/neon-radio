import { EventEmitter } from 'node:events'
import config from '../../config.js'
import { fetchRoamingSongs } from '../../integrations/netease/roaming.js'
import { readRoamingSongs, replaceRoamingSongs, type RadioSong } from '../../repositories/roaming-song.js'
import { publishNeteaseSync, readNeteaseSyncError } from './sync-state.js'

export type { RadioSong } from '../../repositories/roaming-song.js'

interface ManualRoamingSync {
	id: string
	refreshError: string | null
}

export const roamingSongsEvents = new EventEmitter<{ change: [RadioSong[]] }>()
let nextCookie = ''
let nextManualSync: ManualRoamingSync | null = null
let pendingSync: Promise<void> | null = null
let pendingSongs = Promise.resolve()
let currentSongs: RadioSong[] = [] // 最近一次已入库的公开快照

export function getRoamingSongs() {
	return currentSongs
}

// 串行读取并发布已入库列表，避免旧快照晚于新快照下发
export function publishRoamingSongs() {
	const next = pendingSongs.then(async () => {
		const songs = await readRoamingSongs(config.NETEASE_UID)
		currentSongs = songs
		roamingSongsEvents.emit('change', songs)
	})
	pendingSongs = next.catch(() => {})
	return next
}

async function runRoamingSync() {
	while (nextCookie) {
		const cookie = nextCookie
		const manualSync = nextManualSync
		nextCookie = ''
		nextManualSync = null
		if (manualSync) {
			publishNeteaseSync({
				id: manualSync.id,
				phase: 'syncing',
				message: manualSync.refreshError ? 'Cookie 刷新失败，正在后台同步歌曲…' : 'Cookie 已刷新，正在后台同步歌曲…'
			})
		}
		try {
			const songs = new Map<string, Record<string, unknown>>()
			const { playlistCount, trackCount } = await fetchRoamingSongs(config.NETEASE_UID, cookie, batch => {
				// 歌曲名和全部歌手名共同去重，歌手排列顺序不影响身份
				for (const song of batch) {
					const key = JSON.stringify([song.name, Array.from(new Set(song.artists)).sort()])
					if (!songs.has(key)) songs.set(key, song.data)
				}
			})
			await replaceRoamingSongs(config.NETEASE_UID, songs)
			// 提交成功后再推新列表，推送故障不改写已成功入库的同步结果
			await publishRoamingSongs().catch(() => console.warn('[漫游同步] 歌曲已入库，实时列表推送失败'))
			const message = `已读取 ${playlistCount} 个歌单、${trackCount} 首歌曲，去重后入库 ${songs.size} 首`
			console.info(`[漫游同步] ${message}`)
			if (manualSync) {
				publishNeteaseSync({
					id: manualSync.id,
					phase: manualSync.refreshError ? 'error' : 'success',
					message: manualSync.refreshError ? `Cookie 刷新失败：${manualSync.refreshError}；${message}` : message
				})
			}
		} catch (error: unknown) {
			// 不记录网易云原始响应，避免 Cookie 被写入日志
			console.warn(`[漫游同步] 失败，保留上次列表：${error instanceof Error ? error.message : '网易云请求失败'}`)
			if (manualSync) {
				const message = `歌曲同步失败，保留上次列表：${readNeteaseSyncError(error)}`
				publishNeteaseSync({
					id: manualSync.id,
					phase: 'error',
					message: manualSync.refreshError ? `Cookie 刷新失败：${manualSync.refreshError}；${message}` : message
				})
			}
		}
	}
}

// 后端独立同步；在途触发合并为一次后续同步，自动触发不覆盖手动任务标识
export function scheduleRoamingSync(cookie: string, manualSync: ManualRoamingSync | null = null) {
	if (!cookie) return
	nextCookie = cookie
	if (manualSync) nextManualSync = manualSync
	if (pendingSync) return
	pendingSync = runRoamingSync().finally(() => {
		pendingSync = null
		if (nextCookie) scheduleRoamingSync(nextCookie)
	})
}

// 关闭数据库前等待全部后台同步结束
export async function waitForRoamingSync() {
	while (pendingSync) await pendingSync
}
