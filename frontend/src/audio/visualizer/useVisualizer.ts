import { useContext, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { AudioImpact } from '@neon-radio/protocol'
import { RadioAudioContext } from '../context'
import { visualizerConfig as config } from './config'
import { isSceneMotionEnabled } from './motion'
import { createSpectrumCurve, createSpectrumSampler } from './spectrum'

interface Drawing {
	draw(data: Uint8Array<ArrayBuffer>, context: CanvasRenderingContext2D, sampleRate: number, dt: number): void
}

interface View {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	animation: Drawing | null
	createAnimation: (dpr: number) => Drawing
}

// 实时频谱负责绘制，服务端时间轴触发冲击，保留场景暂停和低动态偏好
export function useVisualizer(active = true, sceneRef: RefObject<HTMLDivElement | null> | null = null) {
	const readSpectrum = useContext(RadioAudioContext)?.readSpectrum
	const readImpacts = useContext(RadioAudioContext)?.readImpacts
	const visualsRef = useRef<HTMLDivElement>(null)
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
		const scene = sceneRef?.current
		const ringContext = ring?.getContext('2d')
		const topContext = top?.getContext('2d')
		const bottomContext = bottom?.getContext('2d')
		if (!visuals || !center || !ring || !cover || !image || !top || !bottom || !ringContext || !topContext || !bottomContext || !readSpectrum || !readImpacts) return

		const spectrum = new Uint8Array(config.bufferSize) // 仅供圆环和上下边缘绘制，不参与震动判定
		const ringCurve = createSpectrumCurve(config.ring)
		const edgeCurve = createSpectrumCurve(config.edges)
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
		const frameInterval = 1 / config.maxFps
		const impactInterval = 1 / 60
		let disposed = false
		let frameId = 0
		let previousTime: number | null = null
		let elapsed = 0
		let previousPaintTime = 0
		let backlog = frameInterval
		let impactBacklog = impactInterval
		let sampleRate = 0
		let views: View[] = []
		let coverWidth = 0
		const settings = config.shake
		let centerAnimation: Animation | null = null
		const centerFrames: Keyframe[] = [
			{ transform: 'scale(1)', offset: 0 },
			{ offset: 0.15 },
			{ offset: 0.5 },
			{ transform: 'scale(1)', offset: 1 }
		]
		let impactPlaybackId: string | null = null
		let impactPoints: AudioImpact[] | null = null
		let impactPositionMs = 0
		let impactIndex = 0
		let maxShakeOffset = settings.levels.high.offset
		let lastImpactAngle = Math.random() * Math.PI * 2

		// 封面按固定角速度旋转，不叠加漂移、呼吸或随机角度；低动态偏好下保持静止
		const moveCamera = () => {
			if (!activeRef.current) return
			const rotation = reducedMotion.matches ? 0 : (elapsed / config.camera.spinSeconds) * 360
			image.style.transform = `rotate(${rotation}deg) scale(${config.camera.scale})`
		}

		// 场景位移用三条不同频率的正弦叠加，形成不重复的随机摇晃
		const sceneMotion = Array.from({ length: 3 }, () => {
			const phases = Array.from({ length: 3 }, () => Math.random() * Math.PI * 2)
			const frequencies = [1.1 + Math.random() * 0.3, 0.45 + Math.random() * 0.12, 0.16 + Math.random() * 0.06]
			return (time: number) =>
				Math.sin(time * frequencies[0] + phases[0]) * 0.6 +
				Math.sin(time * frequencies[1] + phases[1]) * 0.3 +
				Math.sin(time * frequencies[2] + phases[2]) * 0.1
		})

		// 场景层只做小幅位移和旋转，固定缩放保证旋转时不露出边缘
		const moveScene = () => {
			if (!scene) return
			const scale = config.scene.scale
			if (reducedMotion.matches || !activeRef.current || !isSceneMotionEnabled()) {
				scene.style.transform = `scale(${scale})`
				return
			}
			// 窄屏按宽度限制幅度，避免位移超出固定缩放留出的边缘余量
			const offset = Math.min(config.scene.offset, window.innerWidth / 40)
			const x = sceneMotion[0](elapsed) * offset
			const y = sceneMotion[1](elapsed) * offset
			const rotation = sceneMotion[2](elapsed) * config.scene.rotation
			scene.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) scale(${scale})`
		}

		// 暂停、换曲或场景恢复时停止旧冲击，并重新定位事件游标
		const resetShake = () => {
			centerAnimation?.cancel()
			centerAnimation = null
			impactPlaybackId = null
			impactPoints = null
			impactPositionMs = 0
			impactIndex = 0
		}

		// 时间轴已决定触发点，中央列按相对强度播放三档冲击，左右信息栏保持静止
		const triggerImpact = (strength: number) => {
			let level: keyof typeof settings.levels = 'low'
			if (strength >= settings.highStrength) level = 'high'
			else if (strength >= settings.mediumStrength) level = 'medium'
			const stage = settings.levels[level]
			// 密集鼓点从当前姿态接续，避免取消旧动画时瞬间跳回原位
			centerFrames[0].transform = centerAnimation?.playState === 'running' ? window.getComputedStyle(center).transform : 'translate3d(0, 0, 0) scale(1)'
			const impact = 0.6 + strength * 0.4
			const amplitude = Math.min(stage.offset, maxShakeOffset) * impact
			// 连续冲击沿上一次方向小幅偏转，避免每拍随机跳向另一侧
			const angle = lastImpactAngle + (Math.random() - 0.5) * 1.1
			lastImpactAngle = angle
			const x = Math.cos(angle) * amplitude
			const y = Math.sin(angle) * amplitude
			const recoil = -(0.35 + Math.random() * 0.25)
			centerFrames[1].offset = level === 'high' ? 0.08 : level === 'medium' ? 0.11 : 0.15
			centerFrames[2].offset = level === 'high' ? 0.32 : level === 'medium' ? 0.4 : 0.5
			centerFrames[1].transform = `translate3d(${x}px, ${y}px, 0) scale(${1 + stage.centerScale * impact})`
			centerFrames[2].transform = `translate3d(${x * recoil}px, ${y * recoil}px, 0) scale(${1 - stage.centerRecoil * impact})`
			centerAnimation?.cancel()
			centerAnimation = center.animate(centerFrames, { duration: stage.duration, easing: 'linear' })
		}

		// 按媒体进度消费已入库时间点，跳转不补播过去的冲击
		const playImpacts = () => {
			const timeline = readImpacts()
			if (!timeline) {
				if (impactPlaybackId !== null) resetShake()
				return
			}
			const position = timeline.positionMs
			if (impactPlaybackId !== timeline.playbackId || impactPoints !== timeline.impacts || position < impactPositionMs || position - impactPositionMs > 250) {
				resetShake()
				impactPlaybackId = timeline.playbackId
				impactPoints = timeline.impacts
				// 二分定位当前进度之后的首个点，避免 seek 或恢复页面时批量补震
				let left = 0
				let right = timeline.impacts.length
				while (left < right) {
					const middle = Math.floor((left + right) / 2)
					if (timeline.impacts[middle].timeMs <= position) left = middle + 1
					else right = middle
				}
				impactIndex = left
				impactPositionMs = position
				return
			}
			impactPositionMs = position
			let due: AudioImpact | null = null
			while (impactIndex < timeline.impacts.length && timeline.impacts[impactIndex].timeMs <= position) {
				due = timeline.impacts[impactIndex]
				impactIndex += 1
			}
			// 超过 100ms 的迟到冲击丢弃，不让卡顿后的画面与音乐错拍
			if (due && position - due.timeMs <= 100) triggerImpact(due.strength / timeline.peakStrength)
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

		// 时间轴按 60 FPS 对齐媒体进度，频谱和封面按配置帧率更新
		const tick = (now: number) => {
			frameId = 0
			if (disposed || !activeRef.current || document.hidden || reducedMotion.matches) return

			const dt = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.1)
			previousTime = now
			elapsed += dt
			impactBacklog += dt
			if (impactBacklog >= impactInterval) {
				playImpacts()
				impactBacklog %= impactInterval
			}
			backlog += dt
			if (backlog >= frameInterval) {
				moveCamera()
				moveScene()
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
			impactBacklog = impactInterval
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
			moveScene()
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
			image.style.transform = `rotate(0deg) scale(${config.camera.scale})`
			if (scene) scene.style.transform = `scale(${config.scene.scale})`
		}
	}, [readImpacts, readSpectrum])

	return { visualsRef, centerRef, ringRef, coverRef, imageRef, topRef, bottomRef }
}
