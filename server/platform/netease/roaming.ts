import { isRecord } from '@neon-radio/protocol'
import { UpstreamError } from '../errors.js'
import { ncmApi, ncmOptions, requireOk } from './client.js'

export interface RoamingSong {
	id: string
	name: string
	artists: string[]
	data: Record<string, unknown>
}

const playlistPageSize = 1000
const songPageSize = 500
const concurrency = 4

function invalid(message: string) {
	return new UpstreamError('unavailable', message)
}

function readId(value: unknown) {
	if (typeof value !== 'string' && typeof value !== 'number') throw invalid('网易云返回的资源 ID 无效')
	if (typeof value === 'number' && !Number.isSafeInteger(value)) throw invalid('网易云返回的资源 ID 无效')
	const id = String(value)
	if (!/^[1-9][0-9]{0,19}$/.test(id)) throw invalid('网易云返回的资源 ID 无效')
	return id
}

function readSong(value: unknown): RoamingSong {
	if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim() || !Array.isArray(value.ar) || !value.ar.length) {
		throw invalid('网易云返回的歌曲名称或歌手信息不完整')
	}
	const artists = value.ar.map((artist: unknown) => {
		if (!isRecord(artist) || typeof artist.name !== 'string' || !artist.name.trim()) throw invalid('网易云返回的歌手信息不完整')
		return artist.name.trim()
	})
	return { id: readId(value.id), name: value.name.trim(), artists, data: value }
}

// 读取全部歌单成员，返回去重后的歌曲 ID（保持首次出现顺序）
export async function fetchRoamingSongIds(uid: string, cookie: string) {
	const playlistIds = new Set<string>()
	// 按 more 分页读取创建及收藏的全部歌单，不只取首屏
	for (let offset = 0; ; offset += playlistPageSize) {
		const body = requireOk(await ncmApi.user_playlist({ ...ncmOptions, uid, limit: playlistPageSize, offset, cookie }), '网易云漫游数据返回异常').body
		if (!Array.isArray(body.playlist) || typeof body.more !== 'boolean') throw invalid('网易云返回的歌单分页数据异常')
		const previousCount = playlistIds.size
		for (const playlist of body.playlist) {
			if (!isRecord(playlist)) throw invalid('网易云返回的歌单数据异常')
			playlistIds.add(readId(playlist.id))
		}
		if (!body.more) break
		if (playlistIds.size === previousCount) throw invalid('网易云歌单分页未返回新数据')
	}

	const playlists = Array.from(playlistIds)
	const songIds = new Set<string>()
	// 歌单详情一次读取完整 ID，同一歌曲跨歌单只请求一次详情
	for (let offset = 0; offset < playlists.length; offset += concurrency) {
		// 等本批在途请求全部结束再处理失败，避免下一次同步叠加请求
		const results = await Promise.allSettled(
			playlists.slice(offset, offset + concurrency).map(async id => {
				const body = requireOk(await ncmApi.playlist_detail({ ...ncmOptions, id, cookie }), '网易云返回的歌单歌曲列表异常').body
				const playlist = body.playlist
				if (!isRecord(playlist) || !Array.isArray(playlist.trackIds)) throw invalid('网易云返回的歌单歌曲列表异常')
				if (typeof playlist.trackCount === 'number' && playlist.trackCount > playlist.trackIds.length) {
					throw invalid('网易云未返回歌单的完整歌曲 ID，取消本次同步')
				}
				return playlist.trackIds.map((track: unknown) => {
					if (!isRecord(track)) throw invalid('网易云返回的歌曲 ID 数据异常')
					return readId(track.id)
				})
			})
		)
		for (const result of results) {
			if (result.status === 'rejected') throw result.reason
			for (const id of result.value) songIds.add(id)
		}
	}
	return { playlistCount: playlists.length, ids: Array.from(songIds) }
}

// 按 ID 批量读取歌曲详情，供增量同步只补齐缺失的歌曲
export async function fetchSongDetails(ids: readonly string[], cookie: string): Promise<RoamingSong[]> {
	const details: RoamingSong[] = []
	for (let offset = 0; offset < ids.length; offset += songPageSize * concurrency) {
		const batches: string[][] = []
		for (let index = offset; index < Math.min(offset + songPageSize * concurrency, ids.length); index += songPageSize) {
			batches.push(ids.slice(index, index + songPageSize))
		}
		const results = await Promise.allSettled(
			batches.map(async batch => {
				const body = requireOk(await ncmApi.song_detail({ ...ncmOptions, ids: batch.join(','), cookie }), '网易云返回的歌曲详情异常').body
				if (!Array.isArray(body.songs)) throw invalid('网易云返回的歌曲详情异常')
				const items = body.songs.map(readSong)
				const returnedIds = new Set(items.map(song => song.id))
				if (batch.some(id => !returnedIds.has(id))) throw invalid('网易云未返回全部歌曲详情，取消本次同步')
				return items
			})
		)
		for (const result of results) {
			if (result.status === 'rejected') throw result.reason
			details.push(...result.value)
		}
	}
	return details
}
