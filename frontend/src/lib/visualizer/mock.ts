// 仅用于视觉占位；后续可由 AnalyserNode.getByteFrequencyData 替换。
export function createMockSpectrum(size: number) {
	const data = new Uint8Array(size)
	const envelope = Float32Array.from({ length: size }, (_, index) => 0.3 + Math.sin((Math.PI * index) / (size - 1)) * 0.7)
	const primarySin = Float32Array.from({ length: size }, (_, index) => Math.sin(index * 0.17))
	const primaryCos = Float32Array.from({ length: size }, (_, index) => Math.cos(index * 0.17))
	const secondarySin = Float32Array.from({ length: size }, (_, index) => Math.sin(index * 0.043))
	const secondaryCos = Float32Array.from({ length: size }, (_, index) => Math.cos(index * 0.043))

	return {
		data,
		update(time: number) {
			const primaryTimeSin = Math.sin(time * 1.8)
			const primaryTimeCos = Math.cos(time * 1.8)
			const secondaryTimeSin = Math.sin(time * 0.85)
			const secondaryTimeCos = Math.cos(time * 0.85)
			const beat = Math.max(0, Math.sin(time * Math.PI * 2 * 1.15)) ** 6

			for (let index = 0; index < size; index += 1) {
				const primary = (primaryTimeSin * primaryCos[index] + primaryTimeCos * primarySin[index] + 1) * 0.5
				const secondary = (secondaryTimeSin * secondaryCos[index] - secondaryTimeCos * secondarySin[index] + 1) * 0.5
				data[index] = Math.round(14 + envelope[index] * (22 + primary * 40 + secondary * 20) + beat * 14 * (1 - index / size))
			}
		}
	}
}
