// 原生模块入口让工作线程不依赖开发环境的 TypeScript 加载器
import { createRequire } from 'node:module'
import { parentPort, workerData } from 'node:worker_threads'

const require = createRequire(import.meta.url)
const Essentia = require('essentia.js/dist/essentia.js-core.umd.js')
const wasm = require('essentia.js/dist/essentia-wasm.umd.js')
const MIN_INTERVAL_MS = 150
const MIN_STRENGTH_RATIO = 0.1

// 用 SuperFlux 选起音时间，以起音后短窗的全频 RMS 保存原始强度
function analyzePcm(pcm, sampleRate, analysisVersion) {
	const durationMs = Math.round(pcm.length / sampleRate * 1000)
	if (durationMs <= 0) throw new Error('音频时长无效')
	const essentia = new Essentia(wasm)
	let signal
	let onsets
	try {
		// 整首音频提取实际起音，不按 BPM 人工生成固定节拍
		signal = essentia.arrayToVector(pcm)
		onsets = essentia.SuperFluxExtractor(signal, 20, 2048, 256, 16, sampleRate, 0.05).onsets
		const times = onsets.size() ? essentia.vectorToArray(onsets) : []
		const candidates = []
		// 在库选定的时间点取约 23ms 全频窗口
		for (const time of times) {
			if (!Number.isFinite(time) || time < 0) continue
			const start = Math.round(time * sampleRate)
			const end = Math.min(pcm.length, start + 1024)
			if (end <= start) continue
			const frame = essentia.arrayToVector(pcm.subarray(start, end))
			try {
				const strength = essentia.RMS(frame).rms
				if (Number.isFinite(strength) && strength > 0) candidates.push({ timeMs: Math.round(time * 1000), strength })
			} finally {
				frame.delete()
			}
		}
		// 弱起音不触发冲击，过密的候选点只保留较强的一次
		const peak = candidates.reduce((value, point) => Math.max(value, point.strength), 0)
		const impacts = []
		for (const point of candidates) {
			if (point.strength < peak * MIN_STRENGTH_RATIO) continue
			const previous = impacts.at(-1)
			if (previous && point.timeMs - previous.timeMs < MIN_INTERVAL_MS) {
				if (point.strength > previous.strength) impacts[impacts.length - 1] = point
			} else impacts.push(point)
		}
		return { analysisVersion, durationMs, impacts }
	} finally {
		onsets?.delete()
		signal?.delete()
		essentia.shutdown()
		essentia.delete()
	}
}

if (!parentPort) throw new Error('音频分析必须在工作线程中执行')
const { signal, sampleRate, analysisVersion } = workerData
parentPort.postMessage(analyzePcm(signal, sampleRate, analysisVersion))
parentPort.close()
