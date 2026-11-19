'use client'

import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { visualizerConfig as config } from '@/config/visualizer'
import { getPlaybackPosition, type RadioLiveState } from './useRadioLive'

export interface RadioImpact {
	timeMs: number
	strength: number // 起音后的原始全频 RMS 振幅
}

export interface RadioImpactFrame {
	playbackId: string
	positionMs: number
	impacts: RadioImpact[]
	peakStrength: number
}

interface RadioImpactTimeline {
	songId: string
	durationMs: number
	impacts: RadioImpact[]
	peakStrength: number
}

export interface RadioAudioState {
	audioRef: RefObject<HTMLAudioElement | null> // 页面唯一音频元素，播放器读取实际进度
	started: boolean // 是否完成首次点击，决定播放器位置和初始模糊层
	playing: boolean // 音频是否实际在播放，不把 WS 受理当成出声
	loading: boolean // 音源或媒体是否正在加载
	error: string | null // 最近的播放错误，点击播放可重试
	range: { start: number; end: number } // 当前可播放区间，单位秒，试听进度只展示这段
	toggle: () => void
	readSpectrum: (data: Uint8Array<ArrayBuffer>) => number // 返回实际采样率，分析节点未初始化时为 0
	readImpacts: () => RadioImpactFrame | null // 返回当前歌曲的时间轴与媒体进度，无数据或未播放时为 null
}

export const RadioAudioContext = createContext<RadioAudioState | null>(null)

// 管理唯一音频实例和分析节点，主线按快照校准，本地以媒体实际位置为准
export default function useRadioAudio(live: RadioLiveState, audioRef: RefObject<HTMLAudioElement | null>): RadioAudioState {
	const [started, setStarted] = useState(false) // 首次点击后解除模糊并把播放器移到底部
	const [playing, setPlaying] = useState(false) // 浏览器确认的真实播放状态
	const [loading, setLoading] = useState(false) // 取链、加载和缓冲状态
	const [error, setError] = useState<string | null>(null) // 可重试的播放错误
	const [retry, setRetry] = useState(0) // 点击重试时重新解析音源
	const [range, setRange] = useState({ start: 0, end: 0 }) // 媒体元数据就绪后更新进度条的可播区间
	const trialRef = useRef<{ start: number; end: number } | null>(null) // 网易云给出的试听边界，不额外维护播放时钟
	const liveRef = useRef(live) // 媒体事件读取最新 WS 快照，避免异步切错歌曲
	const wantedRef = useRef(false) // 用户是否希望继续播放，换曲和缓冲不会改变它
	const sourceIdRef = useRef<string | null>(null) // 当前音频地址对应的歌曲，避免旧媒体事件影响新歌曲
	const contextRef = useRef<AudioContext | null>(null) // 首次用户手势创建的音频上下文
	const analyserRef = useRef<AnalyserNode | null>(null) // 三个画布共用一个频谱分析节点
	const impactTimelineRef = useRef<RadioImpactTimeline | null>(null) // 当前歌曲的服务端震动时间轴
	liveRef.current = live

	// 根据实际音频时长区分已裁切的试听片段与完整文件上的试听区间
	const getPlayableRange = useCallback(() => {
		const audio = audioRef.current // 浏览器解析出的真实音频时长
		const duration = audio && Number.isFinite(audio.duration) ? audio.duration : 0
		const trial = trialRef.current // 接口返回的试听起止位置，单位秒
		const song = liveRef.current.playback?.song // 服务端按音源给出的逻辑总时长
		const length = song && song.id === sourceIdRef.current ? song.duration / 1000 : duration
		if (!trial || trial.end <= trial.start) return { start: 0, end: Math.min(duration, length) }
		const start = duration >= trial.end ? Math.max(0, trial.start) : 0 // 裁切后的短音频从 0 开始
		return { start, end: Math.min(duration, start + Math.min(length, trial.end - trial.start)) }
	}, [audioRef])

	// 媒体就绪后再次尝试播放，暂停意图优先，不在切歌过程中偷偷恢复播放
	const play = useCallback(() => {
		const audio = audioRef.current // 当前页面的媒体元素
		const songId = sourceIdRef.current // 本次播放对应的曲目，用于忽略旧 Promise
		if (!audio || !wantedRef.current || audio.readyState < 1) return
		const available = getPlayableRange() // 到试听边界后等待用户重播或主线切歌，不越界恢复播放
		if (trialRef.current && available.end > 0 && audio.currentTime >= available.end) return
		void audio.play().catch((cause: unknown) => {
			if (
				audioRef.current !== audio ||
				!wantedRef.current ||
				songId !== sourceIdRef.current ||
				(cause instanceof DOMException && cause.name === 'AbortError')
			)
				return
			const message = '播放未能启动，请再次点击播放' // 保留用户手势重试入口
			setPlaying(false)
			setLoading(false)
			setError(message)
			toast.error(message)
		})
	}, [audioRef, getPlayableRange])

	// 新实例需要定位；主线始终按当前逻辑进度续播，包括首次点击和试听曲
	const syncPlayback = useCallback(() => {
		const current = liveRef.current.playback // 最新确认的主线或本地状态
		const audio = audioRef.current // 实际播放时钟
		if (!current?.song || !audio || audio.readyState < 1 || sourceIdRef.current !== current.song.id || audio.seeking) return false
		const changed = audio.dataset.playbackId !== current.playbackId
		if (!changed && (current.mode === 'local' || !wantedRef.current)) return false
		const available = getPlayableRange() // 试听起点只用于媒体偏移，不改变电台逻辑时间
		const position = available.start + (current.mode === 'main' ? getPlaybackPosition(current) : current.positionMs) / 1000
		if (changed || Math.abs(audio.currentTime - position) > 1) {
			audio.currentTime = Math.max(available.start, Math.min(available.end, position))
		}
		audio.dataset.start = String(available.start)
		audio.dataset.playbackId = current.playbackId ?? ''
		return changed
	}, [audioRef, getPlayableRange])

	// 本地音源结束后申请续播；主线结束只等待服务器统一切歌
	const advanceLocal = useCallback(() => {
		const state = liveRef.current // 读取最新连接状态，断线时等恢复后续播
		const audio = audioRef.current
		const current = state.playback
		if (!audio || !wantedRef.current || state.status !== 'ready' || state.playbackPending || current?.mode !== 'local') return
		if (sourceIdRef.current !== current.song?.id || audio.dataset.playbackId !== current.playbackId || audio.currentTime < getPlayableRange().end)
			return
		setLoading(true)
		void state.playNext().then(success => {
			if (!success && liveRef.current.playback?.playbackId === current.playbackId) setLoading(false)
		})
	}, [audioRef, getPlayableRange])

	// 订阅媒体事件，真正卸载时释放音频图；漫游和 WS 重连不重建音频
	useEffect(() => {
		const audio = audioRef.current // React 挂载的唯一音频元素
		if (!audio) return
		let lastCalibration = 0 // 主线进度最多每秒检查一次，不额外启动 RAF
		// 媒体就绪后校准位置，并按用户意图播放
		const ready = () => {
			const available = getPlayableRange() // 试听片段的真实可播范围，供进度条展示
			setRange(previous => (previous.start === available.start && previous.end === available.end ? previous : available))
			setLoading(false)
			syncPlayback()
			play()
		}
		// 原生事件确认已经真正开始播放
		const onPlaying = () => {
			setPlaying(true)
			setLoading(false)
			setError(null)
		}
		// 原生暂停只更新实际状态，不覆盖用户的继续播放意图
		const onPause = () => setPlaying(false)
		// 缓冲时显示加载状态，媒体恢复后继续播放
		const onWaiting = () => {
			if (wantedRef.current) setLoading(true)
		}
		// 音源结束保留连续播放意图，主线和本地各自接下一首
		const onEnded = () => {
			setPlaying(false)
			setLoading(wantedRef.current)
			advanceLocal()
		}
		// 用媒体原生时间事件做低频校准，不建立第二条动画循环
		const onProgress = () => {
			const available = getPlayableRange() // 试听不能继续播放到允许范围之外
			if (trialRef.current && available.end > 0 && audio.currentTime >= available.end && !audio.paused) {
				audio.pause()
				audio.currentTime = available.end
				setLoading(wantedRef.current)
				advanceLocal()
				return
			}
			if (Date.now() - lastCalibration < 1000) return
			lastCalibration = Date.now()
			syncPlayback()
		}
		// 媒体解析或 CDN 请求失败时保留重试入口
		const onError = () => {
			if (!sourceIdRef.current) return
			const message = '音源播放失败，请重试；请确认曲源权限及浏览器跨域支持'
			setPlaying(false)
			setLoading(false)
			setError(message)
			if (wantedRef.current) toast.error(message)
		}
		audio.addEventListener('loadedmetadata', ready)
		audio.addEventListener('canplay', ready)
		audio.addEventListener('playing', onPlaying)
		audio.addEventListener('pause', onPause)
		audio.addEventListener('waiting', onWaiting)
		audio.addEventListener('ended', onEnded)
		audio.addEventListener('timeupdate', onProgress)
		audio.addEventListener('error', onError)
		return () => {
			audio.removeEventListener('loadedmetadata', ready)
			audio.removeEventListener('canplay', ready)
			audio.removeEventListener('playing', onPlaying)
			audio.removeEventListener('pause', onPause)
			audio.removeEventListener('waiting', onWaiting)
			audio.removeEventListener('ended', onEnded)
			audio.removeEventListener('timeupdate', onProgress)
			audio.removeEventListener('error', onError)
			audio.pause()
			audio.removeAttribute('src')
			audio.load()
			// 开发热更新保留同一媒体元素时复用分析图，避免重复创建媒体音源
			if (!audio.isConnected) {
				analyserRef.current = null
				if (contextRef.current) void contextRef.current.close().catch(() => undefined)
				contextRef.current = null
			}
		}
	}, [advanceLocal, audioRef, getPlayableRange, play, syncPlayback])

	// 每个播放实例核对一次音源有效期，地址相同时复用媒体，不打断 seek 或单曲循环
	useEffect(() => {
		const songId = live.playback?.song?.id
		const audio = audioRef.current
		if (!audio) return
		const sameSong = sourceIdRef.current === songId // 同歌曲只刷新链接，不先清空正在播放的音频
		const controller = new AbortController()
		if (!sameSong) {
			sourceIdRef.current = null
			trialRef.current = null
			setRange({ start: 0, end: 0 })
			audio.dataset.playbackId = ''
			audio.pause()
			audio.removeAttribute('src')
			audio.load()
			setPlaying(false)
			setError(null)
			setLoading(Boolean(songId))
		} else if (audio.error) setLoading(true)
		if (!songId) return
		void (async () => {
			try {
				// 音源请求只经过本站业务接口，网易云 Cookie 不进入浏览器
				const response = await fetch(`/neon-radio/radio-audio/${encodeURIComponent(songId)}`, { cache: 'no-store', signal: controller.signal })
				const result: unknown = await response.json()
				if (typeof result !== 'object' || result === null || !('code' in result) || result.code !== 200 || !('data' in result)) {
					throw new Error(
						typeof result === 'object' && result !== null && 'message' in result && typeof result.message === 'string'
							? result.message
							: '音源请求失败'
					)
				}
				const data = result.data // 只接收业务接口返回的媒体地址
				if (!response.ok || typeof data !== 'object' || data === null || !('src' in data) || typeof data.src !== 'string')
					throw new Error('音源返回格式异常')
				if (controller.signal.aborted || liveRef.current.playback?.song?.id !== songId) return
				const wasTrial = Boolean(trialRef.current) // 单曲循环不反复弹试听提示
				trialRef.current = null
				const trial = 'trial' in data ? data.trial : null // 只有真实试听版本才显示提示
				if (
					typeof trial === 'object' &&
					trial !== null &&
					'start' in trial &&
					'end' in trial &&
					typeof trial.start === 'number' &&
					typeof trial.end === 'number'
				) {
					trialRef.current = { start: trial.start, end: trial.end }
					if (!sameSong || !wasTrial) toast.info('当前歌曲为试听版本', { description: liveRef.current.playback?.song?.name })
				}
				sourceIdRef.current = songId
				setError(null)
				if (audio.src !== data.src || audio.error) {
					audio.dataset.playbackId = ''
					audio.pause()
					setPlaying(false)
					setLoading(true)
					audio.src = data.src
					audio.load()
				} else {
					setRange(getPlayableRange())
					syncPlayback()
					play()
				}
			} catch (cause: unknown) {
				if (controller.signal.aborted || liveRef.current.playback?.song?.id !== songId) return
				if (sameSong && audio.readyState >= 1 && !audio.error) return // 当前音频仍可播时不因刷新失败打断
				const message = cause instanceof Error ? cause.message : '音源请求失败'
				setLoading(false)
				setError(message)
				if (wantedRef.current) toast.error(message)
			}
		})()
		return () => controller.abort()
	}, [audioRef, getPlayableRange, live.playback?.playbackId, live.playback?.song?.id, live.playback?.song?.duration, play, retry, syncPlayback])

	// 播放实例或分析结果更新时读取时间轴，缺失时不触发冲击
	useEffect(() => {
		const songId = live.playback?.song?.id
		const controller = new AbortController()
		impactTimelineRef.current = null
		if (!songId) return () => controller.abort()
		void (async () => {
			try {
				// 拉取本站保存的音频时间点和原始强度
				const response = await fetch(`/neon-radio/radio-impacts/${encodeURIComponent(songId)}`, { cache: 'no-store', signal: controller.signal })
				const result: unknown = await response.json()
				if (!response.ok || typeof result !== 'object' || result === null || !('code' in result) || result.code !== 200 || !('data' in result))
					throw new Error('音频时间轴请求失败')
				const data = result.data
				if (
					typeof data !== 'object' || data === null ||
					!('durationMs' in data) || typeof data.durationMs !== 'number' || !Number.isInteger(data.durationMs) || data.durationMs <= 0 ||
					!('impacts' in data) || !Array.isArray(data.impacts)
				) throw new Error('音频时间轴格式异常')
				// 校验递增时间点，只在加载时计算强度上限供动画归一化
				const points: unknown[] = data.impacts
				const impacts: RadioImpact[] = []
				let previousTime = -1
				let peakStrength = 0
				for (const point of points) {
					if (
						typeof point !== 'object' || point === null ||
						!('timeMs' in point) || typeof point.timeMs !== 'number' || !Number.isInteger(point.timeMs) ||
						point.timeMs < 0 || point.timeMs <= previousTime || point.timeMs > data.durationMs ||
						!('strength' in point) || typeof point.strength !== 'number' || !Number.isFinite(point.strength) || point.strength <= 0
					) throw new Error('音频时间点格式异常')
					previousTime = point.timeMs
					peakStrength = Math.max(peakStrength, point.strength)
					impacts.push({ timeMs: point.timeMs, strength: point.strength })
				}
				if (controller.signal.aborted || liveRef.current.playback?.song?.id !== songId) return
				impactTimelineRef.current = { songId, durationMs: data.durationMs, impacts, peakStrength }
			} catch {
				if (!controller.signal.aborted) impactTimelineRef.current = null
			}
		})()
		return () => controller.abort()
	}, [live.playback?.song?.id, live.playback?.playbackId, live.impactsRevision])

	// WS 确认后才应用换曲或定位，202 受理不会让媒体提前跳到旧快照
	useLayoutEffect(() => {
		if (syncPlayback()) play()
		advanceLocal()
	}, [advanceLocal, live.playback, live.status, play, syncPlayback])

	// 首次点击同步解锁音频；主线恢复时追赶最新位置，本地暂停从原位置继续
	const toggle = useCallback(() => {
		const audio = audioRef.current // 用户手势必须直接作用于这个媒体元素
		if (!audio) return
		setStarted(true)
		if (!liveRef.current.playback?.song) {
			toast.info('电台暂无歌曲，请先登录并同步歌单')
			return
		}
		if (wantedRef.current && !error) {
			wantedRef.current = false
			audio.pause()
			setLoading(false)
			void liveRef.current.pause()
			return
		}
		if (!contextRef.current) {
			try {
				const context = new AudioContext() // 只在用户手势中创建一次上下文
				contextRef.current = context
				const analyser = context.createAnalyser() // 旁路分析原始音频，不处理实际听到的声音
				const source = context.createMediaElementSource(audio) // 同一媒体元素只能创建一次音源节点
				const gain = context.createGain() // 保留原有音量，不压缩音乐动态
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
				analyserRef.current = analyser
			} catch {
				if (contextRef.current) void contextRef.current.close().catch(() => undefined)
				contextRef.current = null
				setError('音频初始化失败，请重试')
				toast.error('音频初始化失败，请重试')
				return
			}
		}
		wantedRef.current = true
		void contextRef.current.resume().catch(() => {
			if (audioRef.current !== audio || !wantedRef.current) return
			wantedRef.current = false
			audio.pause()
			setError('音频未能解锁，请再次点击播放')
			toast.error('音频未能解锁，请再次点击播放')
		})
		if (error && (audio.error || !sourceIdRef.current)) {
			setRetry(value => value + 1)
			return
		}
		setError(null)
		syncPlayback()
		play()
		advanceLocal()
	}, [advanceLocal, audioRef, error, play, syncPlayback])

	// 每个绘制帧共享一份原始频谱和实际采样率，暂停或上下文挂起时输出静音
	const readSpectrum = useCallback(
		(data: Uint8Array<ArrayBuffer>) => {
			const analyser = analyserRef.current // 当前唯一分析节点
			if (!analyser || audioRef.current?.paused || analyser.context.state !== 'running') data.fill(0)
			else analyser.getByteFrequencyData(data)
			return analyser?.context.sampleRate ?? 0
		},
		[audioRef]
	)

	// 提供已入库的时间点与真实媒体进度，未就绪时返回 null
	const readImpacts = useCallback((): RadioImpactFrame | null => {
		const audio = audioRef.current
		const timeline = impactTimelineRef.current
		const playback = liveRef.current.playback
		if (
			!audio || !timeline || !playback?.song || !playback.playbackId ||
			timeline.songId !== sourceIdRef.current || timeline.songId !== playback.song.id ||
			audio.dataset.playbackId !== playback.playbackId || audio.paused || audio.seeking || audio.readyState < 1
		) return null
		// 不把完整文件的时间轴错用于裁切后的试听音源
		if (!Number.isFinite(audio.duration) || Math.abs(audio.duration * 1000 - timeline.durationMs) > 1000) return null
		return {
			playbackId: playback.playbackId,
			positionMs: audio.currentTime * 1000,
			impacts: timeline.impacts,
			peakStrength: timeline.peakStrength
		}
	}, [audioRef])

	return { audioRef, started, playing, loading, error, range, toggle, readSpectrum, readImpacts }
}
