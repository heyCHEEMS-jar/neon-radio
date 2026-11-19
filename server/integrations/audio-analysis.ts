import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'

// 按 CommonJS 实际导出读取路径，避开包声明在 NodeNext 下的默认导入类型错配
const ffmpegPath: unknown = createRequire(import.meta.url)('ffmpeg-static')

const FRAME_RATE = 60 // 每秒输出 60 个强度帧，对齐前端鼓点采样节奏
const PCM_RATE = 48_000 // 解码采样率，48000 / 60 = 800 点合成一帧
const MIN_DB = -70 // 强度映射窗口，-70dB 记 0、-5dB 记 255
const MAX_DB = -5
const DOWNLOAD_LIMIT = 200 * 1024 * 1024 // 音源文件大小上限，防止异常大文件写满磁盘

export interface AudioBassEnvelope {
	sampleRate: number // 每秒包络帧数
	envelope: Buffer // 0–255 低频强度字节，时间从音源起点开始
}

// 把一帧 RMS 换算成 0–255 强度字节，超出映射窗口按边界截断
function rmsToByte(rms: number) {
	if (rms <= 0) return 0
	const db = 20 * Math.log10(rms)
	return Math.round(Math.max(0, Math.min(255, ((db - MIN_DB) / (MAX_DB - MIN_DB)) * 255)))
}

// 下载音源到临时文件，供 ffmpeg 随机读取
async function downloadAudio(src: string) {
	const file = path.join(tmpdir(), 'neon-radio-energy.tmp')
	const response = await axios.get(src, { responseType: 'stream', timeout: 120_000, maxContentLength: DOWNLOAD_LIMIT })
	try {
		await pipeline(response.data, createWriteStream(file))
	} catch (error: unknown) {
		await rm(file, { force: true })
		throw error
	}
	return file
}

// 用 ffmpeg 把音源过滤成 35–160Hz 单声道 PCM，按帧合成 RMS 强度字节
function decodeBassEnvelope(file: string): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		if (typeof ffmpegPath !== 'string' || !ffmpegPath) throw new Error('ffmpeg-static 不支持当前平台架构')
		const ffmpeg = spawn(
			ffmpegPath,
			[
				'-hide_banner',
				'-loglevel',
				'error',
				'-i',
				file,
				'-af',
				'highpass=f=35,lowpass=f=160',
				'-ac',
				'1',
				'-ar',
				String(PCM_RATE),
				'-f',
				's16le',
				'pipe:1'
			],
			{ windowsHide: true }
		)
		const pcm: Buffer[] = [] // 收集整段滤波后的 PCM，结束后统一合成
		const stderr: Buffer[] = [] // 截取 ffmpeg 的报错信息用于日志
		let stderrLength = 0
		ffmpeg.stdout.on('data', (chunk: Buffer) => pcm.push(chunk))
		ffmpeg.stderr.on('data', (chunk: Buffer) => {
			if (stderrLength >= 4096) return
			stderr.push(chunk)
			stderrLength += chunk.length
		})
		ffmpeg.on('error', (error: NodeJS.ErrnoException) =>
			reject(
				error.code === 'ENOENT'
					? new Error(`ffmpeg-static 可执行文件缺失（${ffmpegPath}），请重新安装依赖并确认其安装脚本已执行`)
					: error
			)
		)
		ffmpeg.on('close', code => {
			if (code !== 0) {
				const message = Buffer.concat(stderr).toString('utf8').trim().split('\n').pop() || `ffmpeg 退出码 ${code}`
				reject(new Error(`ffmpeg 解码失败：${message}`))
				return
			}
			const data = Buffer.concat(pcm)
			const windowSize = PCM_RATE / FRAME_RATE
			const frames: number[] = []
			let pendingCount = 0 // 当前帧已累计的样本数
			let sumSquares = 0 // 当前帧样本平方和
			for (let offset = 0; offset + 1 < data.length; offset += 2) {
				const sample = data.readInt16LE(offset) / 32768
				sumSquares += sample * sample
				if (++pendingCount < windowSize) continue
				frames.push(rmsToByte(Math.sqrt(sumSquares / windowSize)))
				pendingCount = 0
				sumSquares = 0
			}
			// 末尾不足一帧的样本按实际帧长合成，避免丢掉最后一拍
			if (pendingCount > 0) frames.push(rmsToByte(Math.sqrt(sumSquares / pendingCount)))
			resolve(Buffer.from(frames))
		})
	})
}

// 下载并用 ffmpeg 分析音源的低频强度包络，完成后清理临时文件
export async function fetchBassEnvelope(src: string): Promise<AudioBassEnvelope> {
	const file = await downloadAudio(src)
	try {
		const envelope = await decodeBassEnvelope(file)
		if (!envelope.length) throw new Error('音源解码结果为空')
		return { sampleRate: FRAME_RATE, envelope }
	} finally {
		await rm(file, { force: true })
	}
}
