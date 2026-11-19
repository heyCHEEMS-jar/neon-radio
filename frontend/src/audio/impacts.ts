import type { AudioImpact } from '@neon-radio/protocol'
import { isRecord } from '@neon-radio/protocol'

export interface RadioImpactFrame {
	playbackId: string
	positionMs: number
	impacts: AudioImpact[]
	peakStrength: number
}

export interface RadioImpactTimeline {
	songId: string
	durationMs: number
	impacts: AudioImpact[]
	peakStrength: number
}

// 拉取服务端已入库的时间轴并计算强度上限；不可用时返回 null，宁可不动也不自行生成震动
export async function fetchImpactTimeline(songId: string, signal: AbortSignal): Promise<RadioImpactTimeline | null> {
	try {
		const response = await fetch(`/neon-radio/radio-impacts/${encodeURIComponent(songId)}`, { cache: 'no-store', signal })
		const result: unknown = await response.json()
		if (!response.ok || !isRecord(result) || result.code !== 200 || !isRecord(result.data)) return null
		const { durationMs, impacts } = result.data
		if (typeof durationMs !== 'number' || !Number.isInteger(durationMs) || durationMs <= 0 || !Array.isArray(impacts)) return null
		const points = impacts.filter(
			(point): point is AudioImpact => isRecord(point) && typeof point.timeMs === 'number' && typeof point.strength === 'number'
		)
		const peakStrength = points.reduce((peak, point) => Math.max(peak, point.strength), 0)
		return { songId, durationMs, impacts: points, peakStrength }
	} catch {
		return null
	}
}
