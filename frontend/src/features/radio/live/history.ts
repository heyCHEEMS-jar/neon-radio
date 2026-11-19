export interface PlaybackHistory {
	songIds: string[]
	cur: number
}

// append 为去重追加，数字为回退到已有历史位置
export type HistoryAction = 'append' | number

// 新播放先按歌曲 ID 去重再追加
export function appendHistory(current: PlaybackHistory, songId: string): PlaybackHistory {
	const songIds = [...current.songIds.filter(id => id !== songId), songId]
	return { songIds, cur: songIds.length - 1 }
}

// 回退历史只移动游标，不改变数组顺序
export function moveHistory(current: PlaybackHistory, songId: string, index: number): PlaybackHistory | null {
	if (current.songIds[index] !== songId) return null
	return { songIds: current.songIds, cur: index }
}
