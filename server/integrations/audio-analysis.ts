import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Transform, type Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { Worker } from 'node:worker_threads'
import axios from 'axios'

// 按 CommonJS 实际导出读取路径，避开包声明在 NodeNext 下的默认导入类型错配
const ffmpegPath: unknown = createRequire(import.meta.url)('ffmpeg-static')
const PCM_RATE = 44_100
const DOWNLOAD_LIMIT = 200 * 1024 * 1024
const PCM_LIMIT = 128 * 1024 * 1024
const ANALYSIS_TIMEOUT = 120_000
export const AUDIO_ANALYSIS_VERSION = 2

export interface AudioImpact {
	timeMs: number
	strength: number // 起音后短窗的原始全频 RMS 振幅
}

export interface AudioImpactTimeline {
	analysisVersion: number
	durationMs: number // 解码文件的实际时长，时间点从文件起点计时
	impacts: AudioImpact[]
}

// 流式下载音源并限制实际接收大小，避免异常文件写满磁盘
async function downloadAudio(src: string, file: string) {
	const response = await axios.get<Readable>(src, { responseType: 'stream', timeout: ANALYSIS_TIMEOUT })
	let received = 0
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			received += chunk.length
			if (received > DOWNLOAD_LIMIT) callback(new Error('音源文件超过分析大小限制'))
			else callback(null, chunk)
		}
	})
	await pipeline(response.data, limiter, createWriteStream(file))
}

// 解码完整频段的单声道 PCM，供 Essentia 离线分析
function decodeAudio(file: string): Promise<Float32Array<ArrayBuffer>> {
	return new Promise((resolve, reject) => {
		if (typeof ffmpegPath !== 'string' || !ffmpegPath) throw new Error('ffmpeg-static 不支持当前平台架构')
		const ffmpeg = spawn(
			ffmpegPath,
			[
				'-nostdin', '-hide_banner', '-loglevel', 'error', '-protocol_whitelist', 'file,pipe',
				'-i', file, '-vn', '-ac', '1', '-ar', String(PCM_RATE), '-f', 'f32le', 'pipe:1'
			],
			{ windowsHide: true }
		)
		const chunks: Buffer[] = []
		let size = 0
		let stderr = ''
		let failure: Error | null = null
		const timer = setTimeout(() => {
			failure = new Error('音频解码超时')
			ffmpeg.kill()
		}, ANALYSIS_TIMEOUT)
		ffmpeg.stdout.on('data', (chunk: Buffer) => {
			if (failure) return
			size += chunk.length
			if (size > PCM_LIMIT) {
				failure = new Error('音频解码结果超过分析大小限制')
				ffmpeg.kill()
				return
			}
			chunks.push(chunk)
		})
		ffmpeg.stderr.on('data', (chunk: Buffer) => {
			if (stderr.length < 4096) stderr += chunk.toString('utf8').slice(0, 4096 - stderr.length)
		})
		ffmpeg.once('error', (error: NodeJS.ErrnoException) => {
			failure = error.code === 'ENOENT' ? new Error(`ffmpeg-static 可执行文件缺失（${ffmpegPath}）`) : error
		})
		// 等待子进程关闭后再结束请求，Windows 上临时文件才不会仍被占用
		ffmpeg.once('close', code => {
			clearTimeout(timer)
			if (failure) return reject(failure)
			if (code !== 0) return reject(new Error(`ffmpeg 解码失败：${stderr.trim().split('\n').pop() || code}`))
			if (!size || size % 4) return reject(new Error('音频解码结果为空或格式异常'))
			const data = Buffer.concat(chunks, size)
			const signal = new Float32Array(size / 4)
			for (let index = 0; index < signal.length; index += 1) signal[index] = data.readFloatLE(index * 4)
			resolve(signal)
		})
	})
}

// 在线程中生成震动时间轴，CPU 密集分析不阻塞电台时钟和实时连接
function analyzeImpacts(signal: Float32Array<ArrayBuffer>): Promise<AudioImpactTimeline> {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL('./audio-analysis-worker.mjs', import.meta.url), {
			workerData: { signal, sampleRate: PCM_RATE, analysisVersion: AUDIO_ANALYSIS_VERSION },
			transferList: [signal.buffer]
		})
		let result: AudioImpactTimeline | null = null
		let failure: Error | null = null
		const timer = setTimeout(() => {
			failure = new Error('音频分析超时')
			void worker.terminate()
		}, ANALYSIS_TIMEOUT)
		worker.once('message', (timeline: AudioImpactTimeline) => {
			result = timeline
		})
		worker.once('error', (error: Error) => {
			failure = error
		})
		worker.once('exit', code => {
			clearTimeout(timer)
			if (failure) return reject(failure)
			if (code !== 0 || !result) return reject(new Error('音频分析未完成'))
			resolve(result)
		})
	})
}

// 下载、解码并分析完整音源，所有阶段结束后清理独立临时目录
export async function fetchImpactTimeline(src: string): Promise<AudioImpactTimeline> {
	const directory = await mkdtemp(path.join(tmpdir(), 'neon-radio-impacts-'))
	try {
		const file = path.join(directory, 'audio')
		// 下载到独立文件，ffmpeg 不直接访问远程地址
		await downloadAudio(src, file)
		// 解码为 Essentia 所需的单声道 44100Hz 音频
		const signal = await decodeAudio(file)
		// 将 PCM 转交分析线程，只返回稀疏的时间点和强度
		return await analyzeImpacts(signal)
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}
