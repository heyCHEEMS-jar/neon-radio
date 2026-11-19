import { EventEmitter } from 'node:events'
import type { RadioSong } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'
import config from '../../config.js'
import { createLogger } from '../../platform/logger.js'
import { fetchRoamingSongIds, fetchSongDetails } from '../../platform/netease/roaming.js'
import { deleteUnreferencedChorusRows } from '../chorus/index.js'
import { deleteUnreferencedLyricRows } from '../lyric/index.js'
import { publishNeteaseSync, readNeteaseSyncError } from '../sync-state.js'
import { readRoamingSongDetails, readRoamingSongs, replaceRoamingSongs } from './store.js'

export interface ManualRoamingSync {
	id: string
	refreshError: string | null
	refreshDetails?: boolean
}

// 歌曲名和全部歌手名共同去重，歌手排列顺序不影响身份
function identity(data: Record<string, unknown>) {
	const name = typeof data.name === 'string' ? data.name.trim() : ''
	const artists = Array.isArray(data.ar) ? data.ar.filter(isRecord).map(artist => String(artist.name ?? '').trim()).filter(Boolean) : []
	return JSON.stringify([name, Array.from(new Set(artists)).sort()])
}

const logger = createLogger('漫游同步')
export const songsEvents = new EventEmitter<{ change: [RadioSong[]] }>()

let nextCookie = ''
let nextManualSync: ManualRoamingSync | null = null
let pendingSync: Promise<void> | null = null
let pendingPublish = Promise.resolve()
let currentSongs: RadioSong[] = []

export function getRoamingSongs() {
	return currentSongs
}

// 串行读取并发布已入库列表，避免旧快照晚于新快照下发
export function publishRoamingSongs() {
	const next = pendingPublish.then(async () => {
		const songs = await readRoamingSongs(config.NETEASE_UID)
		currentSongs = songs
		songsEvents.emit('change', songs)
	})
	pendingPublish = next.catch(() => {})
	return next
}

async function runSync() {
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
			// 先扫描歌单成员，再与库中已有详情对比，只请求缺失的歌曲详情
			const { playlistCount, ids } = await fetchRoamingSongIds(config.NETEASE_UID, cookie)
			const existing = await readRoamingSongDetails(config.NETEASE_UID)
			const refreshDetails = manualSync?.refreshDetails === true
			const needed = refreshDetails ? ids : ids.filter(id => !existing.has(id))
			const fetched = needed.length ? await fetchSongDetails(needed, cookie) : []
			const fresh = new Map(fetched.map(song => [song.id, song.data]))

			const songs = new Map<string, Record<string, unknown>>()
			for (const id of ids) {
				const data = fresh.get(id) ?? existing.get(id)
				if (!data) continue
				const key = identity(data)
				if (!songs.has(key)) songs.set(key, data)
			}
			await replaceRoamingSongs(config.NETEASE_UID, songs)
			// 提交成功后再推新列表，推送故障不改写已成功入库的同步结果
			await publishRoamingSongs().catch(() => logger.warn('歌曲已入库，实时列表推送失败'))
			// 列表切换完成后清理已下线歌曲的歌词和副歌缓存，清理失败不影响本次入库
			const keep = new Set(Array.from(songs.values(), song => String(song.id)))
			try {
				const [lyricCount, chorusCount] = await Promise.all([
					deleteUnreferencedLyricRows(config.NETEASE_UID, keep),
					deleteUnreferencedChorusRows(config.NETEASE_UID, keep)
				])
				if (lyricCount || chorusCount) logger.info('已清理下线歌曲缓存：歌词 ' + lyricCount + ' 条、副歌 ' + chorusCount + ' 条')
			} catch (error: unknown) {
				logger.warn('清理下线歌曲缓存失败：' + (error instanceof Error ? error.message : '数据库请求失败'))
			}
			const message = `已读取 ${playlistCount} 个歌单、${ids.length} 首歌曲，去重后入库 ${songs.size} 首，本次获取 ${fetched.length} 首详情`
			logger.info(message)
			if (manualSync) {
				publishNeteaseSync({
					id: manualSync.id,
					phase: manualSync.refreshError ? 'error' : 'success',
					message: manualSync.refreshError ? `Cookie 刷新失败：${manualSync.refreshError}；${message}` : message
				})
			}
		} catch (error: unknown) {
			// 不记录网易云原始响应，避免 Cookie 被写入日志
			logger.warn(`失败，保留上次列表：${error instanceof Error ? error.message : '网易云请求失败'}`)
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

// 是否有同步任务正在执行（排队中的触发也算）
export function isRoamingSyncing() {
	return pendingSync !== null || Boolean(nextCookie)
}

// 后端独立同步；已有任务未结束时不再排队，返回 false 由调用方决定是否提示
export function scheduleRoamingSync(cookie: string, manualSync: ManualRoamingSync | null = null) {
	if (!cookie || isRoamingSyncing()) return false
	nextCookie = cookie
	if (manualSync) nextManualSync = manualSync
	pendingSync = runSync().finally(() => {
		pendingSync = null
		if (nextCookie) scheduleRoamingSync(nextCookie)
	})
	return true
}

// 关闭数据库前等待全部后台同步结束
export async function waitForRoamingSync() {
	while (pendingSync) await pendingSync
}
