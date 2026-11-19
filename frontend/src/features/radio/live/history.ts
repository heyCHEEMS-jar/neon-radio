export interface PlaybackHistory {
	songIds: string[]
	cur: number
}

// append 为追加到当前游标之后，数字为回退到已有历史位置
export type HistoryAction = 'append' | number

// 重复播放当前歌不新增历史；播放其他歌时丢弃已回退之后的分支再追加
export function appendHistory(current: PlaybackHistory, songId: string): PlaybackHistory {
	if (current.songIds[current.cur] === songId) return current
	const songIds = [...current.songIds.slice(0, current.cur + 1), songId]
	return { songIds, cur: songIds.length - 1 }
}

// 回退历史只移动游标，不改变数组顺序
export function moveHistory(current: PlaybackHistory, songId: string, index: number): PlaybackHistory | null {
	if (current.songIds[index] !== songId) return null
	return { songIds: current.songIds, cur: index }
}
