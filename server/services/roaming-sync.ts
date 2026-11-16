import config from '../config.js'
import { ApiError, isRecord, ncmApi, ncmOptions } from '../utils/ncm.js'
import { publishNeteaseSync, readNeteaseSyncError } from './netease-sync-state.js'
import { replaceRoamingSongs } from './roaming-song-repository.js'

interface ManualRoamingSync {
	id: string
	refreshError: string | null
}

const playlistPageSize = 1000
const songPageSize = 500
const concurrency = 4
let nextCookie = ''
let nextManualSync: ManualRoamingSync | null = null
let pendingSync: Promise<void> | null = null

function readResponseBody(response: { body: unknown }) {
	if (!isRecord(response.body) || response.body.code !== 200) throw new ApiError(502, '网易云漫游数据返回异常')
	return response.body
}

function readId(value: unknown) {
	if (typeof value !== 'string' && typeof value !== 'number') throw new ApiError(502, '网易云返回的资源 ID 无效')
	if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new ApiError(502, '网易云返回的资源 ID 无效')
	const id = String(value)
	if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new ApiError(502, '网易云返回的资源 ID 无效')
	return id
}

// 歌曲名和全部歌手名共同去重，歌手排列顺序不影响身份
function readSong(value: unknown) {
	if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim() || !Array.isArray(value.ar) || !value.ar.length) {
		throw new ApiError(502, '网易云返回的歌曲名称或歌手信息不完整')
	}
	const artists = value.ar.map((artist: unknown) => {
		if (!isRecord(artist) || typeof artist.name !== 'string' || !artist.name.trim()) {
			throw new ApiError(502, '网易云返回的歌手信息不完整')
		}
		return artist.name.trim()
	})
	return {
		id: readId(value.id),
		key: JSON.stringify([value.name.trim(), Array.from(new Set(artists)).sort()]),
		data: value
	}
}

async function collectRoamingSongs(cookie: string) {
	const playlistIds = new Set<string>()
	// 按 more 分页读取创建及收藏的全部歌单，不只取首屏
	for (let offset = 0; ; offset += playlistPageSize) {
		const body = readResponseBody(await ncmApi.user_playlist({ ...ncmOptions, uid: config.NETEASE_UID, limit: playlistPageSize, offset, cookie }))
		if (!Array.isArray(body.playlist) || typeof body.more !== 'boolean') throw new ApiError(502, '网易云返回的歌单分页数据异常')
		const previousCount = playlistIds.size
		for (const playlist of body.playlist) {
			if (!isRecord(playlist)) throw new ApiError(502, '网易云返回的歌单数据异常')
			playlistIds.add(readId(playlist.id))
		}
		if (!body.more) break
		if (playlistIds.size === previousCount) throw new ApiError(502, '网易云歌单分页未返回新数据')
	}

	const playlists = Array.from(playlistIds)
	const songIds = new Set<string>()
	// 歌单详情一次读取完整 ID，同一歌曲跨歌单只请求一次详情
	for (let offset = 0; offset < playlists.length; offset += concurrency) {
		// 等本批在途请求全部结束再处理失败，避免下一次同步叠加请求
		const results = await Promise.allSettled(
			playlists.slice(offset, offset + concurrency).map(async id => {
				const body = readResponseBody(await ncmApi.playlist_detail({ ...ncmOptions, id, cookie }))
				const playlist = body.playlist
				if (!isRecord(playlist) || !Array.isArray(playlist.trackIds)) throw new ApiError(502, '网易云返回的歌单歌曲列表异常')
				if (typeof playlist.trackCount === 'number' && playlist.trackCount > playlist.trackIds.length) {
					throw new ApiError(502, '网易云未返回歌单的完整歌曲 ID，取消本次同步')
				}
				return playlist.trackIds.map((track: unknown) => {
					if (!isRecord(track)) throw new ApiError(502, '网易云返回的歌曲 ID 数据异常')
					return readId(track.id)
				})
			})
		)
		for (const result of results) {
			if (result.status === 'rejected') throw result.reason
			for (const id of result.value) songIds.add(id)
		}
	}

	const ids = Array.from(songIds)
	const songs = new Map<string, Record<string, unknown>>()
	// 歌曲详情分批读取，每次不超过接口允许的 1000 首
	for (let offset = 0; offset < ids.length; offset += songPageSize * concurrency) {
		const batches: string[][] = []
		for (let index = offset; index < Math.min(offset + songPageSize * concurrency, ids.length); index += songPageSize) {
			batches.push(ids.slice(index, index + songPageSize))
		}
		const results = await Promise.allSettled(
			batches.map(async batch => {
				const body = readResponseBody(await ncmApi.song_detail({ ...ncmOptions, ids: batch.join(','), cookie }))
				if (!Array.isArray(body.songs)) throw new ApiError(502, '网易云返回的歌曲详情异常')
				const details = body.songs.map(readSong)
				const returnedIds = new Set(details.map(song => song.id))
				if (batch.some(id => !returnedIds.has(id))) throw new ApiError(502, '网易云未返回全部歌曲详情，取消本次同步')
				return details
			})
		)
		for (const result of results) {
			if (result.status === 'rejected') throw result.reason
			for (const song of result.value) {
				if (!songs.has(song.key)) songs.set(song.key, song.data)
			}
		}
	}
	return { songs, playlistCount: playlists.length, trackCount: ids.length }
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
			const { songs, playlistCount, trackCount } = await collectRoamingSongs(cookie)
			await replaceRoamingSongs(config.NETEASE_UID, songs)
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
