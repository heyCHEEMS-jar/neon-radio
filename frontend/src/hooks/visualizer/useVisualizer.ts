import { useEffect, useRef } from 'react'
import { visualizerConfig as config } from '@/config/visualizer'
import { createMockSpectrum } from '@/lib/visualizer/mock'

interface Drawing {
	draw(data: Uint8Array, context: CanvasRenderingContext2D): void
}

interface View {
	canvas: HTMLCanvasElement
	context: CanvasRenderingContext2D
	animation: Drawing | null
	createAnimation: (dpr: number) => Drawing
}

export function useVisualizer() {
	const ringRef = useRef<HTMLCanvasElement>(null)
	const coverRef = useRef<HTMLDivElement>(null)
	const imageRef = useRef<HTMLImageElement>(null)
	const topRef = useRef<HTMLCanvasElement>(null)
	const bottomRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const ring = ringRef.current
		const cover = coverRef.current
		const image = imageRef.current
		const top = topRef.current
		const bottom = bottomRef.current
		const ringContext = ring?.getContext('2d')
		const topContext = top?.getContext('2d')
		const bottomContext = bottom?.getContext('2d')
		if (!ring || !cover || !image || !top || !bottom || !ringContext || !topContext || !bottomContext) return

		const spectrum = createMockSpectrum(config.bufferSize)
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
		const frameInterval = 1 / config.maxFps
		let disposed = false
		let frameId = 0
		let previousTime: number | null = null
		let elapsed = 0
		let backlog = frameInterval
		let resizeObserver: ResizeObserver | undefined
		let views: View[] = []
		let coverWidth = 0
		let maxCameraOffset = 0
		let cameraStartedAt = 0
		// 以约 6–7 秒的缓慢起伏为主，叠加少量更慢的漂移，去掉高频抖动。
		const cameraMotion = Array.from({ length: 3 }, () => {
			const phases = Array.from({ length: 2 }, () => Math.random() * Math.PI * 2)
			const frequencies = [1.1 + Math.random() * 0.2, 0.25 + Math.random() * 0.15]
			return (time: number) =>
				Math.sin(time * frequencies[0] + phases[0]) * 0.9 +
				Math.sin(time * frequencies[1] + phases[1]) * 0.1
		})

		const moveCamera = () => {
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

		const paint = () => {
			spectrum.update(reducedMotion.matches ? 0 : elapsed)
			for (const view of views) {
				view.context.clearRect(0, 0, view.canvas.width, view.canvas.height)
				view.animation?.draw(spectrum.data, view.context)
			}
		}

		const tick = (now: number) => {
			frameId = 0
			if (disposed || document.hidden || reducedMotion.matches) return

			const dt = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.1)
			previousTime = now
			elapsed += dt
			moveCamera()
			backlog += dt
			if (backlog >= frameInterval) {
				backlog %= frameInterval
				paint()
			}
			frameId = window.requestAnimationFrame(tick)
		}

		const start = () => {
			if (disposed || document.hidden || reducedMotion.matches || frameId || !views.length) return
			previousTime = null
			backlog = frameInterval
			frameId = window.requestAnimationFrame(tick)
		}

		const resize = () => {
			if (disposed) return
			const dpr = Math.min(window.devicePixelRatio || 1, config.maxDpr)
			const coverSize = cover.getBoundingClientRect().width
			const nextCoverWidth = coverSize * dpr
			// 放大后的图片保留足够余量，让位移和旋转都不会露出圆形裁切边界。
			maxCameraOffset = Math.max(0, Math.min(config.camera.maxOffset, coverSize * (config.camera.scale - 1) / (2 * Math.SQRT2) * 0.85))
			const coverResized = nextCoverWidth !== coverWidth
			coverWidth = nextCoverWidth
			for (const view of views) {
				const bounds = view.canvas.getBoundingClientRect()
				const width = Math.max(1, Math.round(bounds.width * dpr))
				const height = Math.max(1, Math.round(bounds.height * dpr))
				if (
					view.canvas.width !== width ||
					view.canvas.height !== height ||
					!view.animation ||
					(view.canvas === ring && coverResized)
				) {
					view.canvas.width = width
					view.canvas.height = height
					view.animation = view.createAnimation(dpr)
				}
			}
			moveCamera()
			paint()
		}

		const syncPlayback = () => {
			if (document.hidden || reducedMotion.matches) {
				window.cancelAnimationFrame(frameId)
				frameId = 0
				previousTime = null
				if (!document.hidden) {
					moveCamera()
					paint()
				}
			} else {
				start()
			}
		}

		void (async () => {
			try {
				const { Wave } = await import('@foobar404/wave')
				if (disposed) return

				// Wave.js 的运行时支持空音频，但类型声明未包含 null。
				// 只获取绘图类，不开启库内无法取消的自动播放循环，也不创建 AudioContext。
				const registry: unknown = Reflect.construct(Wave, [null, ring, true])
				if (!(registry instanceof Wave)) throw new Error('Wave.js animation registry is unavailable')

				const createEdge: any = (canvas: HTMLCanvasElement, context: CanvasRenderingContext2D, side: 'top' | 'bottom'): View => ({
					canvas,
					context,
					animation: null,
					createAnimation: dpr => {
						const count = Math.min(config.edges.maxCount, Math.max(12, Math.floor(canvas.width / dpr / config.edges.spacing)))
						return new registry.animations.Lines({
							count,
							[side]: true,
							mirroredX: true,
							frequencyBand: 'mids',
							lineWidth: Math.max(dpr, canvas.width / count - config.edges.gap * dpr),
							lineColor: config.edges.color,
							rounded: true,
							glow: { strength: config.edges.glow.strength * dpr, color: config.edges.glow.color }
						})
					}
				})

				views = [
					{
						canvas: ring,
						context: ringContext,
						animation: null,
						createAnimation: dpr => {
							const radius = coverWidth / 2 + config.ring.gap * dpr
							const maxHeight = Math.max(0, Math.min(
								config.ring.maxHeight * dpr,
								2 * (Math.min(ring.width, ring.height) / 2 - radius - (config.ring.lineWidth + config.ring.glow.strength) * dpr)
							))
							const count = Math.max(8, Math.min(config.ring.count, Math.floor(2 * Math.PI * radius / (config.ring.spacing * dpr))))
							const step = Math.PI * 2 / count
							const directions = Array.from({ length: count }, (_, index) => {
								const angle = index * step - Math.PI / 2
								return {
									angle,
									cos: Math.cos(angle),
									sin: Math.sin(angle),
									midCos: Math.cos(angle + step / 2),
									midSin: Math.sin(angle + step / 2),
									sample: Math.floor(config.bufferSize * (0.125 + 0.375 * index / count))
								}
							})

							return {
								draw(data, context) {
									context.save()
									context.translate(ring.width / 2, ring.height / 2)
									context.strokeStyle = config.ring.color
									context.lineWidth = config.ring.lineWidth * dpr
									context.lineJoin = 'miter'
									context.shadowBlur = config.ring.glow.strength * dpr
									context.shadowColor = config.ring.glow.color
									context.beginPath()
									for (let index = 0; index < count; index += 1) {
										const { angle, cos, sin, midCos, midSin, sample } = directions[index]
										const next = directions[(index + 1) % count]
										const strength = Math.max(0, data[sample] - config.ring.openThreshold) / (255 - config.ring.openThreshold)
										const impact = Math.min(1, strength * config.ring.sensitivity) ** 2
										const halfHeight = maxHeight * impact / 2
										context.moveTo(radius * cos, radius * sin)
										if (halfHeight === 0) {
											context.arc(0, 0, radius, angle, angle + step)
											continue
										}
										context.lineTo((radius + halfHeight) * midCos, (radius + halfHeight) * midSin)
										context.lineTo(radius * next.cos, radius * next.sin)
										context.lineTo((radius - halfHeight) * midCos, (radius - halfHeight) * midSin)
										context.closePath()
									}
									context.stroke()
									context.restore()
								}
							}
						}
					},
					createEdge(top, topContext, 'top'),
					createEdge(bottom, bottomContext, 'bottom')
				]

				resizeObserver = new ResizeObserver(resize)
				for (const view of views) resizeObserver.observe(view.canvas)
				resizeObserver.observe(cover)
				window.addEventListener('resize', resize)
				document.addEventListener('visibilitychange', syncPlayback)
				reducedMotion.addEventListener('change', syncPlayback)
				resize()
				start()
			} catch (error) {
				if (!disposed) console.error('Wave.js visualizer:', error)
			}
		})()

		return () => {
			disposed = true
			window.cancelAnimationFrame(frameId)
			resizeObserver?.disconnect()
			window.removeEventListener('resize', resize)
			document.removeEventListener('visibilitychange', syncPlayback)
			reducedMotion.removeEventListener('change', syncPlayback)
			for (const view of views) view.context.clearRect(0, 0, view.canvas.width, view.canvas.height)
			views = []
			image.style.transform = `scale(${config.camera.scale})`
		}
	}, [])

	return { ringRef, coverRef, imageRef, topRef, bottomRef }
}
