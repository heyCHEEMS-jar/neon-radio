import { useContext, useEffect, useLayoutEffect, useRef } from 'react'
import { visualizerConfig as config } from '@/config/visualizer'
import { RadioAudioContext } from '@/hooks/useRadioAudio'

interface Drawing {
	draw(data: Uint8Array<ArrayBuffer>, context: CanvasRenderingContext2D, sampleRate: number, dt: number): void
}

interface View {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	animation: Drawing | null
	createAnimation: (dpr: number) => Drawing
}

interface SpectrumBand {
	start: number
	end: number
	left: number
	right: number
	weight: number
	narrow: boolean
}

interface SpectrumResponse {
	openThreshold: number
	sensitivity: number
	power: number
}

// 预计算 256 级视觉高度曲线，绘制帧直接查表，不重复做幂运算
function createSpectrumCurve(response: SpectrumResponse) {
	const curve = new Float32Array(256)
	for (let value = 0; value < curve.length; value += 1) {
		const strength = Math.max(0, value - response.openThreshold) / (255 - response.openThreshold)
		curve[value] = Math.min(1, strength * response.sensitivity) ** response.power
	}
	return curve
}

// 缓存对数分频映射，窄频带插值、宽频带只取峰值，复用结果数组
function createSpectrumSampler(count: number, minFrequency: number, maxFrequency: number, curve: Float32Array) {
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

// 共用音频分析节点驱动频谱与鼓点冲击，保留场景暂停和低动态偏好
export function useVisualizer(active = true) {
	const readSpectrum = useContext(RadioAudioContext)?.readSpectrum
	const readBass = useContext(RadioAudioContext)?.readBass
	const visualsRef = useRef<HTMLElement>(null)
	const centerRef = useRef<HTMLDivElement>(null)
	const ringRef = useRef<HTMLCanvasElement>(null)
	const coverRef = useRef<HTMLDivElement>(null)
	const imageRef = useRef<HTMLImageElement>(null)
	const topRef = useRef<HTMLCanvasElement>(null)
	const bottomRef = useRef<HTMLCanvasElement>(null)
	const activeRef = useRef(active)
	const syncPlaybackRef = useRef<(() => void) | null>(null)

	// 只切换播放状态，保留绘图实例和累计时间
	useLayoutEffect(() => {
		activeRef.current = active
		syncPlaybackRef.current?.()
	}, [active])

	useEffect(() => {
		const visuals = visualsRef.current
		const center = centerRef.current
		const ring = ringRef.current
		const cover = coverRef.current
		const image = imageRef.current
		const top = topRef.current
		const bottom = bottomRef.current
		const ringContext = ring?.getContext('2d')
		const topContext = top?.getContext('2d')
		const bottomContext = bottom?.getContext('2d')
		if (!visuals || !center || !ring || !cover || !image || !top || !bottom || !ringContext || !topContext || !bottomContext || !readSpectrum || !readBass) return

		const spectrum = new Uint8Array(config.bufferSize) // 仅供圆环和上下边缘绘制，不参与震动判定
		const ringCurve = createSpectrumCurve(config.ring)
		const edgeCurve = createSpectrumCurve(config.edges)
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
		const frameInterval = 1 / config.maxFps
		const beatInterval = 1 / 60
		let disposed = false
		let frameId = 0
		let previousTime: number | null = null
		let elapsed = 0
		let previousPaintTime = 0
		let backlog = frameInterval
		let beatBacklog = beatInterval
		let sampleRate = 0
		let views: View[] = []
		let coverWidth = 0
		let maxCameraOffset = 0
		let cameraStartedAt = 0
		const settings = config.shake
		const bassBaselineRate = 1 / settings.baselineSeconds
		let shakeAnimation: Animation | null = null
		let centerAnimation: Animation | null = null
		const shakeFrames: Keyframe[] = [
			{ transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
			{ offset: 0.15 },
			{ offset: 0.5 },
			{ transform: 'translate3d(0, 0, 0) scale(1)', offset: 1 }
		]
		const centerFrames: Keyframe[] = [
			{ transform: 'scale(1)', offset: 0 },
			{ offset: 0.15 },
			{ offset: 0.5 },
			{ transform: 'scale(1)', offset: 1 }
		]
		let bassBaseline = 0
		let previousBass = 0
		let beatReady = false
		let lastBeatAt = -Infinity
		let maxShakeOffset = settings.levels.high.offset
		// 以约 6–7 秒的缓慢起伏为主，叠加少量更慢的漂移，去掉高频抖动
		const cameraMotion = Array.from({ length: 3 }, () => {
			const phases = Array.from({ length: 2 }, () => Math.random() * Math.PI * 2)
			const frequencies = [1.1 + Math.random() * 0.2, 0.25 + Math.random() * 0.15]
			return (time: number) => Math.sin(time * frequencies[0] + phases[0]) * 0.9 + Math.sin(time * frequencies[1] + phases[1]) * 0.1
		})

		// 场景激活时缓慢移动封面，低动态偏好下只保留缩放
		const moveCamera = () => {
			if (!activeRef.current) return
			if (reducedMotion.matches) {
				cameraStartedAt = elapsed
				image.style.transform = `scale(${config.camera.scale})`
				return
			}
			const progress = Math.min(1, elapsed - cameraStartedAt)
			const fade = progress * progress * (3 - 2 * progress)
			const time = elapsed * config.camera.speed
			const x = cameraMotion[0](time) * maxCameraOffset * fade
			const y = cameraMotion[1](time) * maxCameraOffset * fade
			const rotation = cameraMotion[2](time) * config.camera.maxRotation * fade
			image.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${config.camera.scale})`
		}

		// 停止鼓点冲击并重置检测基线，恢复时不把持续低音误判成新鼓点
		const resetShake = () => {
			shakeAnimation?.cancel()
			centerAnimation?.cancel()
			shakeAnimation = null
			centerAnimation = null
			beatReady = false
			lastBeatAt = -Infinity
		}

		// 仅使用服务端包络，无数据时停止冲击并清除检测基线
		const shakeToBeat = (dt: number) => {
			if (reducedMotion.matches) return
			const bass = readBass()
			if (bass === null) {
				if (beatReady) resetShake()
				return
			}
			if (!beatReady) {
				bassBaseline = previousBass = bass
				beatReady = true
				return
			}
			// 只比较低音频带当前冲击与自身慢基线，不读取中高频，也不判断音高
			const rise = bass - previousBass
			const excess = bass - bassBaseline
			const onsetScore = Math.max(rise, excess) / Math.max(0.08, bassBaseline)
			previousBass = bass
			bassBaseline += (bass - bassBaseline) * Math.min(1, dt * bassBaselineRate)
			if (rise <= 0 || excess < settings.noiseFloor || onsetScore < settings.levels.medium.minOnset) return
			if (elapsed - lastBeatAt < settings.cooldownSeconds) return

			const level = onsetScore >= settings.levels.high.minOnset ? 'high' : 'medium'
			const stage = settings.levels[level]
			const strength = Math.min(1, onsetScore / (settings.levels.high.minOnset * 1.5))
			const impact = 0.6 + strength * 0.4
			const amplitude = Math.min(stage.offset, maxShakeOffset) * impact

			// 每个鼓点只生成一次随机冲击方向，两档使用不同的幅度、时长和缩放
			lastBeatAt = elapsed
			const angle = Math.random() * Math.PI * 2
			const x = Math.cos(angle) * amplitude
			const y = Math.sin(angle) * amplitude
			const recoil = -(0.35 + Math.random() * 0.25)
			shakeFrames[1].offset = level === 'high' ? 0.08 : 0.11
			shakeFrames[2].offset = level === 'high' ? 0.32 : 0.4
			shakeFrames[1].transform = `translate3d(${x}px, ${y}px, 0) scale(${1 + stage.scale * impact})`
			shakeFrames[2].transform = `translate3d(${x * recoil}px, ${y * recoil}px, 0) scale(1)`
			shakeAnimation?.cancel()
			shakeAnimation = visuals.animate(shakeFrames, { duration: stage.duration, easing: 'linear' })

			// 中央封面、双方框和圆环使用同一级别的独立鼓起与回缩
			centerFrames[1].offset = shakeFrames[1].offset
			centerFrames[2].offset = level === 'high' ? 0.38 : shakeFrames[2].offset
			centerFrames[1].transform = `scale(${1 + stage.centerScale * impact})`
			centerFrames[2].transform = `scale(${1 - stage.centerRecoil * impact})`
			centerAnimation?.cancel()
			centerAnimation = center.animate(centerFrames, { duration: stage.duration, easing: 'linear' })
		}

		// 圆环和边缘独立读取实时频谱，只负责绘制，不参与震动判定
		const paint = () => {
			if (!activeRef.current || document.hidden) return
			sampleRate = readSpectrum(spectrum)
			const dt = Math.min(elapsed - previousPaintTime || frameInterval, 0.1)
			previousPaintTime = elapsed
			for (const view of views) {
				view.context.clearRect(0, 0, view.canvas.width, view.canvas.height)
				view.animation?.draw(spectrum, view.context, sampleRate, dt)
			}
		}

		// 服务端包络按 60 FPS 读取，频谱和封面按配置帧率更新
		const tick = (now: number) => {
			frameId = 0
			if (disposed || !activeRef.current || document.hidden || reducedMotion.matches) return

			const dt = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.1)
			previousTime = now
			elapsed += dt
			beatBacklog += dt
			if (beatBacklog >= beatInterval) {
				const beatDt = Math.min(beatBacklog, 0.1)
				shakeToBeat(beatDt)
				beatBacklog %= beatInterval
			}
			backlog += dt
			if (backlog >= frameInterval) {
				moveCamera()
				paint()
				backlog %= frameInterval
			}
			frameId = window.requestAnimationFrame(tick)
		}

		// 仅在可见且允许动画时启动唯一绘制循环
		const start = () => {
			if (disposed || !activeRef.current || document.hidden || reducedMotion.matches || frameId || !views.length) return
			previousTime = null
			backlog = frameInterval
			beatBacklog = beatInterval
			frameId = window.requestAnimationFrame(tick)
		}

		// 画布尺寸变化时重建几何和频带缓存，保留封面运动时钟
		const resize = () => {
			if (disposed || !activeRef.current || document.hidden) return
			// 先归位再测量，避免冲击缩放污染画布尺寸；手机降低震幅
			resetShake()
			maxShakeOffset = Math.min(settings.levels.high.offset, visuals.clientWidth / 40)
			const dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr)
			const coverSize = cover.getBoundingClientRect().width
			const nextCoverWidth = coverSize * dpr
			// 放大后的图片保留余量，让位移和旋转不会露出圆形裁切边界
			maxCameraOffset = Math.max(0, Math.min(config.camera.maxOffset, ((coverSize * (config.camera.scale - 1)) / (2 * Math.SQRT2)) * 0.85))
			const coverResized = nextCoverWidth !== coverWidth
			coverWidth = nextCoverWidth
			for (const view of views) {
				const bounds = view.canvas.getBoundingClientRect()
				const width = Math.max(1, Math.round(bounds.width * dpr))
				const height = Math.max(1, Math.round(bounds.height * dpr))
				if (view.canvas.width !== width || view.canvas.height !== height || !view.animation || (view.canvas === ring && coverResized)) {
					view.canvas.width = width
					view.canvas.height = height
					view.animation = view.createAnimation(dpr)
				}
			}
			moveCamera()
			paint()
		}

		// 场景或可见性变化时停止旧循环，再按当前条件恢复
		const syncPlayback = () => {
			window.cancelAnimationFrame(frameId)
			frameId = 0
			previousTime = null
			resetShake()
			if (disposed || !activeRef.current || document.hidden) return
			resize()
			start()
		}
		syncPlaybackRef.current = syncPlayback

		// 上下边缘分别响应中高频和低频，保留圆头、光晕及左右镜像
		const createEdge = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, side: 'top' | 'bottom'): View => ({
			canvas,
			context,
			animation: null,
			createAnimation: dpr => {
				const count = Math.min(config.edges.maxCount, Math.max(12, Math.floor(canvas.width / dpr / config.edges.spacing)))
				const { minFrequency, maxFrequency } = config.edges[side]
				const sample = createSpectrumSampler(Math.ceil(count / 2), minFrequency, maxFrequency, edgeCurve)
				const spacing = canvas.width / count
				const lineWidth = Math.max(dpr, spacing - config.edges.gap * dpr)
				const glowStrength = config.edges.glow.strength * dpr
				const maxHeight = Math.max(0, canvas.height - lineWidth / 2 - glowStrength)
				const baseline = side === 'top' ? 0 : canvas.height
				const direction = side === 'top' ? 1 : -1
				const bars = Array.from({ length: count }, (_, index) => ({
					x: (index + 0.5) * spacing,
					band: Math.floor(Math.abs(index - (count - 1) / 2))
				}))
				const gradient = context.createLinearGradient(0, 0, canvas.width, 0)
				config.edges.color.gradient.forEach((color, index, colors) => gradient.addColorStop(index / Math.max(1, colors.length - 1), color))
				// 画布重建时一次性设置样式，绘制帧只更新柱高和路径
				context.strokeStyle = gradient
				context.lineWidth = lineWidth
				context.lineCap = 'round'
				context.shadowBlur = glowStrength
				context.shadowColor = config.edges.glow.color

				return {
					// 读取已映射的高度，再批量绘制缓存位置上的柱线
					draw(data, context, sampleRate) {
						const values = sample(data, sampleRate)
						context.beginPath()
						for (const { x, band } of bars) {
							const height = maxHeight * values[band]
							if (!height) continue
							context.moveTo(x, baseline)
							context.lineTo(x, baseline + height * direction)
						}
						context.stroke()
					}
				}
			}
		})

		// 三个画布自行绘制，不让第三方库按数组比例再次截取频带
		views = [
			{
				canvas: ring,
				context: ringContext,
				animation: null,
				createAnimation: dpr => {
					// 以 480px 画布为基准缩放线宽和光晕，最细保留 1px
					const scale = Math.min(1, ring.width / dpr / 480)
					const lineWidth = Math.max(1, config.ring.lineWidth * scale) * dpr
					const glowStrength = config.ring.glow.strength * scale * dpr
					const radius = coverWidth / 2 + config.ring.gap * dpr
					const maxHeight = Math.max(
						0,
						Math.min(config.ring.maxHeight * dpr, Math.min(ring.width, ring.height) / 2 - radius - (lineWidth + glowStrength))
					)
					const count = Math.max(8, Math.min(config.ring.count, Math.floor((2 * Math.PI * radius) / (config.ring.spacing * dpr))))
					const sample = createSpectrumSampler(count, config.ring.minFrequency, config.ring.maxFrequency, ringCurve)
					const baseline = new Float32Array(count)
					const heights = new Float32Array(count)
					const points = new Float32Array(count * 2) // 波线坐标复用，不在绘制帧创建对象
					const response = config.ring.response
					const baselineRate = 1 / response.baselineSeconds
					const attackRate = 1 / response.attackSeconds
					let initialized = false
					const step = (Math.PI * 2) / count
					// 位置、邻近频带和回落速率都只在重建画布时计算
					const bandOrder = Array.from({ length: count }, (_, index) => ({ index, position: (index * 0.61803398875) % 1 }))
						.sort((left, right) => left.position - right.position)
					const directions = Array.from({ length: count }, (_, index) => {
						const band = bandOrder[index].index
						const angle = index * step - Math.PI / 2
						return {
							band,
							left: Math.max(0, band - 1),
							right: Math.min(count - 1, band + 1),
							releaseRate: 1 / (response.releaseSeconds * (1.4 - 0.8 * band / (count - 1))),
							cos: Math.cos(angle),
							sin: Math.sin(angle)
						}
					})
					ringContext.strokeStyle = config.ring.color
					ringContext.lineWidth = lineWidth
					ringContext.lineCap = 'round'
					ringContext.shadowBlur = glowStrength
					ringContext.shadowColor = config.ring.glow.color

					return {
						// 更新局部峰值，再用轻量二次曲线拉出波线，不再绘制刻度或菱形
						draw(data, context, sampleRate, dt) {
							const values = sample(data, sampleRate)
							if (!initialized) {
								baseline.set(values)
								initialized = true
							}
							// 波峰只向外伸展，避免线条穿进封面；各频带仍独立回落
							const baselineMix = Math.min(1, dt * baselineRate)
							for (let index = 0; index < count; index += 1) {
								const { band, left, right, releaseRate, cos, sin } = directions[index]
								const level = values[band]
								const contrast = Math.max(0, level - (values[left] + values[right]) / 2)
								const transient = Math.max(0, level - baseline[band])
								const target = Math.min(1, level * response.sustain + contrast * response.contrastBoost + transient * response.transientBoost)
								const mix = Math.min(1, dt * (target > heights[band] ? attackRate : releaseRate))
								heights[band] += (target - heights[band]) * mix
								baseline[band] += (level - baseline[band]) * baselineMix
								const distance = radius + maxHeight * heights[band]
								points[index * 2] = distance * cos
								points[index * 2 + 1] = distance * sin
							}
							// 相邻点之间平滑衔接，形成被局部峰值拉开的细圆环轮廓
							context.translate(ring.width / 2, ring.height / 2)
							context.beginPath()
							const last = points.length - 2
							context.moveTo((points[last] + points[0]) / 2, (points[last + 1] + points[1]) / 2)
							for (let offset = 0; offset < points.length; offset += 2) {
								const next = offset + 2 === points.length ? 0 : offset + 2
								context.quadraticCurveTo(
									points[offset],
									points[offset + 1],
									(points[offset] + points[next]) / 2,
									(points[offset + 1] + points[next + 1]) / 2
								)
							}
							context.closePath()
							context.stroke()
							context.resetTransform()
						}
					}
				}
			},
			createEdge(top, topContext, 'top'),
			createEdge(bottom, bottomContext, 'bottom')
		]

		// 订阅尺寸、场景可见性与低动态偏好，再启动首帧
		const resizeObserver = new ResizeObserver(resize)
		for (const view of views) resizeObserver.observe(view.canvas)
		resizeObserver.observe(cover)
		window.addEventListener('resize', resize)
		document.addEventListener('visibilitychange', syncPlayback)
		reducedMotion.addEventListener('change', syncPlayback)
		syncPlayback()

		return () => {
			// 卸载时停止循环、释放监听并清空画布，不影响音频播放
			disposed = true
			syncPlaybackRef.current = null
			window.cancelAnimationFrame(frameId)
			resetShake()
			resizeObserver.disconnect()
			window.removeEventListener('resize', resize)
			document.removeEventListener('visibilitychange', syncPlayback)
			reducedMotion.removeEventListener('change', syncPlayback)
			for (const view of views) view.context.clearRect(0, 0, view.canvas.width, view.canvas.height)
			views = []
			image.style.transform = `scale(${config.camera.scale})`
		}
	}, [readBass, readSpectrum])

	return { visualsRef, centerRef, ringRef, coverRef, imageRef, topRef, bottomRef }
}
