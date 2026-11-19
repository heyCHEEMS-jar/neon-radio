import { isRecord } from '@neon-radio/protocol'
import { visualizerConfig as config } from './visualizer/config'

export interface AudioSource {
	src: string
	trial: { start: number; end: number } | null
}

export interface PlayableRange {
	start: number
	end: number
}

// 根据实际音频时长区分已裁切的试听片段与完整文件上的试听区间
export function getPlayableRange(audio: HTMLAudioElement | null, trial: { start: number; end: number } | null, logicalDurationMs: number): PlayableRange {
	const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0
	const length = logicalDurationMs > 0 ? logicalDurationMs / 1000 : duration
	if (!trial || trial.end <= trial.start) return { start: 0, end: Math.min(duration, length) }
	// 裁切后的短音频从 0 开始
	const start = duration >= trial.end ? Math.max(0, trial.start) : 0
	return { start, end: Math.min(duration, start + Math.min(length, trial.end - trial.start)) }
}

// 首次用户手势创建一次分析图；同一媒体元素只能创建一次音源节点
export function createAnalyser(audio: HTMLAudioElement) {
	const context = new AudioContext()
	const analyser = context.createAnalyser()
	const source = context.createMediaElementSource(audio)
	const gain = context.createGain()
	gain.gain.value = 0.4
	// 这些参数只影响可视化，不改变播放频率范围或音质
	analyser.fftSize = config.bufferSize * 2
	analyser.smoothingTimeConstant = config.spectrum.smoothingTimeConstant
	analyser.minDecibels = config.spectrum.minDecibels
	analyser.maxDecibels = config.spectrum.maxDecibels
	// 播放直接输出；分析分支不连接扬声器，避免重复叠加声音
	source.connect(gain)
	gain.connect(context.destination)
	source.connect(analyser)
	return { context, analyser }
}

// 音源请求只经过本站业务接口，网易云 Cookie 不进入浏览器
export async function fetchAudioSource(songId: string, signal: AbortSignal): Promise<AudioSource> {
	const response = await fetch(`/neon-radio/radio-audio/${encodeURIComponent(songId)}`, { cache: 'no-store', signal })
	const result: unknown = await response.json()
	const message = isRecord(result) && typeof result.message === 'string' ? result.message : '音源请求失败'
	if (!response.ok || !isRecord(result) || result.code !== 200 || !isRecord(result.data) || typeof result.data.src !== 'string') throw new Error(message)
	const trialData = isRecord(result.data.trial) ? result.data.trial : null
	const trial = trialData && typeof trialData.start === 'number' && typeof trialData.end === 'number' ? { start: trialData.start, end: trialData.end } : null
	return { src: result.data.src, trial }
}
