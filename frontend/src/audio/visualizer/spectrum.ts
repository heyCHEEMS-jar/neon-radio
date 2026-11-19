// 预计算与频带采样只依赖数组，不持有 DOM 状态
export interface SpectrumBand {
	start: number
	end: number
	left: number
	right: number
	weight: number
	narrow: boolean
}

export interface SpectrumResponse {
	openThreshold: number
	sensitivity: number
	power: number
}

// 预计算 256 级视觉高度曲线，绘制帧直接查表，不重复做幂运算
export function createSpectrumCurve(response: SpectrumResponse) {
	const curve = new Float32Array(256)
	for (let value = 0; value < curve.length; value += 1) {
		const strength = Math.max(0, value - response.openThreshold) / (255 - response.openThreshold)
		curve[value] = Math.min(1, strength * response.sensitivity) ** response.power
	}
	return curve
}

// 缓存对数分频映射，窄频带插值、宽频带只取峰值，复用结果数组
export function createSpectrumSampler(count: number, minFrequency: number, maxFrequency: number, curve: Float32Array) {
	const values = new Float32Array(count)
	let cachedSampleRate = 0
	let bands: SpectrumBand[] = []

	return (data: Uint8Array<ArrayBuffer>, sampleRate: number) => {
		if (!sampleRate) return values.fill(0)
		// 采样率变化时才计算频率、索引和插值权重
		if (sampleRate !== cachedSampleRate) {
			cachedSampleRate = sampleRate
			const binWidth = sampleRate / (data.length * 2)
			const ratio = maxFrequency / minFrequency
			bands = Array.from({ length: count }, (_, index) => {
				const lower = minFrequency * ratio ** (index / count) / binWidth
				const upper = minFrequency * ratio ** ((index + 1) / count) / binWidth
				const start = Math.min(data.length - 1, Math.floor(lower))
				const center = Math.min(data.length - 1, Math.sqrt(lower * upper))
				const left = Math.floor(center)
				return {
					start,
					end: Math.min(data.length, Math.max(start + 1, Math.ceil(upper))),
					left,
					right: Math.min(data.length - 1, left + 1),
					weight: center - left,
					narrow: upper - lower < 1
				}
			})
		}
		// 保留频带峰值，不再累计平方、求均方值或开方
		for (let index = 0; index < count; index += 1) {
			const band = bands[index]
			let value = 0
			if (band.narrow) {
				value = data[band.left] + (data[band.right] - data[band.left]) * band.weight
			} else {
				for (let bin = band.start; bin < band.end; bin += 1) {
					if (data[bin] > value) value = data[bin]
				}
			}
			values[index] = curve[Math.round(value)]
		}
		return values
	}
}

