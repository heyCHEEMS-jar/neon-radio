import type { ServerMessage } from '@neon-radio/protocol'
import type { RefObject } from 'react'
import type { RadioImpactFrame } from './impacts'

export interface RadioAudioState {
	audioRef: RefObject<HTMLAudioElement | null> // 页面唯一音频元素，播放器读取实际进度
	started: boolean // 是否完成首次点击，决定播放器位置和初始模糊层
	playing: boolean // 音频是否实际在播放，不把 WS 受理当成出声
	loading: boolean // 音源或媒体是否正在加载
	error: ServerMessage | null // 最近的播放错误，点击播放可重试
	range: { start: number; end: number } // 当前可播放区间，单位秒，试听进度只展示这段
	toggle: () => void
	readSpectrum: (data: Uint8Array<ArrayBuffer>) => number // 返回实际采样率，分析节点未初始化时为 0
	readImpacts: () => RadioImpactFrame | null // 返回当前歌曲的时间轴与媒体进度，无数据或未播放时为 null
}
