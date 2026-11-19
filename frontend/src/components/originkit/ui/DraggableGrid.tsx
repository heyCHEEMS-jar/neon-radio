'use client'

import { animate, motion, useDragControls, useMotionValue } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Spinner } from '@/components/ui/spinner'
import styles from '@/styles/draggable-grid.module.css'
import TiltedCard from './TiltedCard'

export interface GridItem {
	id?: string
	name?: string
	artists?: string[]
	duration?: number
	image?: { src?: string; srcSet?: string; alt?: string }
	alt?: string
}

export interface DraggableGridProps {
	items?: GridItem[]
	columns?: number
	overscan?: number
	mobileColumns?: number
	mobileOverscan?: number
	imageWidth?: number
	imageHeight?: number
	fitViewport?: boolean
	tilt?: boolean
	minImageSize?: number
	rounded?: number
	gap?: number
	enableWheel?: boolean
	placeholderColor?: string
	onItemClick?: (item: GridItem, index: number) => void
	initialItemId?: string | null
	activeItemId?: string | null
	active?: boolean
	style?: CSSProperties
}

interface VisibleRange {
	firstColumn: number
	lastColumn: number
	firstRow: number
	lastRow: number
}

interface GridCell {
	column: number
	row: number
	index: number
}

interface Point {
	x: number
	y: number
}

interface ViewportBounds {
	left: number
	right: number
	top: number
	bottom: number
}

const tiltX = 18
const tiltY = -14
const emptyRange: VisibleRange = { firstColumn: 0, lastColumn: -1, firstRow: 0, lastRow: -1 }

const defaultItems: GridItem[] = [
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/612d1402-0ad9-4135-3bbc-a30a6a252b00/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/6d2ad64a-102d-4eab-0efe-31479e34b500/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/be854dd1-37aa-4fc7-f569-fdb948109300/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/51984031-9176-484b-f5e0-4af9a8e9ed00/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/34ce1842-4b7a-4d52-0302-38582c341700/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/88369c6d-00cc-4ac9-74ca-0f0965e06300/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/aeaa0756-9647-4f6c-d900-204bd25e4a00/w=800'
		},
		alt: ''
	},
	{
		image: {
			src: 'https://imagedelivery.net/IEUjvl3YUlxY-MrTpOAWDQ/316d1761-fd79-4ca9-b8d4-f2bb20521a00/w=800'
		},
		alt: ''
	}
]

function getItemColor(index: number) {
	return `hsl(${(index * 137.508) % 360}, 55%, 55%)`
}

// 将屏幕四角反投影到倾斜平面，避免虚拟网格边缘漏图
function getViewportBounds(width: number, height: number, perspective: number, tilt: boolean): ViewportBounds {
	if (!tilt) return { left: 0, right: width, top: 0, bottom: height }
	const cosX = Math.cos((tiltX * Math.PI) / 180)
	const sinX = Math.sin((tiltX * Math.PI) / 180)
	const cosY = Math.cos((tiltY * Math.PI) / 180)
	const sinY = Math.sin((tiltY * Math.PI) / 180)
	const bounds: ViewportBounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
	const corners = [
		{ x: 0, y: 0 },
		{ x: width, y: 0 },
		{ x: width, y: height },
		{ x: 0, y: height }
	]
	for (const point of corners) {
		const screenX = point.x - width / 2
		const screenY = point.y - height / 2
		const divisor = cosY * cosX + (cosY * sinX * screenY - sinY * screenX) / perspective
		const planeX = width / 2 + (cosX * screenX) / divisor
		const planeY = height / 2 + (cosY * screenY - sinX * sinY * screenX) / divisor
		bounds.left = Math.min(bounds.left, planeX)
		bounds.right = Math.max(bounds.right, planeX)
		bounds.top = Math.min(bounds.top, planeY)
		bounds.bottom = Math.max(bounds.bottom, planeY)
	}
	return bounds
}

// Originkit 网格，按完整列表循环并按视口虚拟渲染
export default function DraggableGrid({
	items = defaultItems,
	columns = 15,
	overscan = 0,
	mobileColumns,
	mobileOverscan,
	imageWidth = 200,
	imageHeight = 200,
	fitViewport = false,
	tilt = false,
	minImageSize = 120,
	rounded = 3,
	gap = 5,
	enableWheel = false,
	placeholderColor = '#1a1a1f',
	onItemClick,
	initialItemId,
	activeItemId,
	active = true,
	style
}: DraggableGridProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const x = useMotionValue(0)
	const y = useMotionValue(0)
	const dragControls = useDragControls()
	const wheelAnimations = useRef<ReturnType<typeof animate>[]>([])
	const wheelTarget = useRef<Point | null>(null)
	const hasMoved = useRef(false)

	const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
	const [visibleRange, setVisibleRange] = useState(emptyRange)
	const [isDragging, setIsDragging] = useState(false)
	const [imagesReady, setImagesReady] = useState(false)
	const [failedImages, setFailedImages] = useState(() => new Set<string>())

	const safeItems = Array.isArray(items) && items.length > 0 ? items : defaultItems
	// 复用容器宽度，768px 以下使用手机配置
	const isMobile = containerSize.w < 768
	const currentColumns = isMobile ? (mobileColumns ?? columns) : columns
	const currentOverscan = isMobile ? (mobileOverscan ?? overscan) : overscan
	const safeColumns = Math.max(1, Math.min(20, Math.floor(currentColumns || 15)))
	const safeOverscan = Number.isFinite(currentOverscan) ? Math.max(0, Math.floor(currentOverscan)) : 0
	const blockColumns = Math.min(safeColumns, safeItems.length)
	const blockRows = Math.ceil(safeItems.length / blockColumns)
	const safeGap = Math.max(0, Math.min(100, gap)) * 4
	// 按视口长边缩放正方形，短边和小屏允许裁切
	const safeImageWidth = fitViewport
		? Math.max(20, minImageSize, (Math.max(containerSize.w, containerSize.h) - safeGap * (safeColumns + 1)) / safeColumns)
		: Math.max(20, Math.min(4000, imageWidth))
	const safeImageHeight = fitViewport ? safeImageWidth : Math.max(20, Math.min(4000, imageHeight))
	const cellWidth = safeImageWidth + safeGap
	const cellHeight = safeImageHeight + safeGap
	const perspective = Math.max(800, Math.max(containerSize.w, containerSize.h) * 0.9)
	const radius = (Math.max(0, Math.min(20, rounded)) / 20) * (Math.min(safeImageWidth, safeImageHeight) / 2)

	const stopMotion = useCallback(() => {
		wheelAnimations.current.forEach(animation => animation.stop())
		wheelAnimations.current = []
		wheelTarget.current = null
		x.stop()
		y.stop()
	}, [x, y])

	// 读取未变换的视口尺寸，测量前不挂载封面
	useLayoutEffect(() => {
		const el = containerRef.current
		if (!el) return
		const measure = () => {
			const { clientWidth: width, clientHeight: height } = el
			setContainerSize(current => (current.w === width && current.h === height ? current : { w: width, h: height }))
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(el)
		return () => observer.disconnect()
	}, [])

	// 打开或切换列表时把初始歌曲放到中央，播放标记变化不重置拖动位置
	useLayoutEffect(() => {
		dragControls.cancel()
		stopMotion()
		hasMoved.current = false
		const foundIndex = initialItemId ? safeItems.findIndex(item => item.id === initialItemId) : -1
		const initialIndex = Math.max(0, foundIndex)
		const initialColumn = initialIndex % blockColumns
		const initialRow = Math.floor(initialIndex / blockColumns)
		x.set(containerSize.w > 0 ? containerSize.w / 2 - initialColumn * cellWidth - safeImageWidth / 2 : safeGap)
		y.set(containerSize.h > 0 ? containerSize.h / 2 - initialRow * cellHeight - safeImageHeight / 2 : safeGap)
		setIsDragging(false)
		setImagesReady(false)
		return () => {
			dragControls.cancel()
			stopMotion()
		}
	}, [
		active,
		safeItems,
		initialItemId,
		containerSize.w,
		containerSize.h,
		blockColumns,
		cellWidth,
		cellHeight,
		safeImageWidth,
		safeImageHeight,
		safeGap,
		dragControls,
		stopMotion,
		x,
		y
	])

	// 按矩形相交计算可见行列，只有跨过卡片边缘才更新 React
	useLayoutEffect(() => {
		if (!active || containerSize.w <= 0 || containerSize.h <= 0) {
			setVisibleRange(emptyRange)
			return
		}
		const bounds = getViewportBounds(containerSize.w, containerSize.h, perspective, tilt)
		const updateRange = () => {
			const offsetX = x.get()
			const offsetY = y.get()
			const next: VisibleRange = {
				firstColumn: Math.floor((bounds.left - offsetX - safeImageWidth) / cellWidth) + 1,
				lastColumn: Math.ceil((bounds.right - offsetX) / cellWidth) - 1,
				firstRow: Math.floor((bounds.top - offsetY - safeImageHeight) / cellHeight) + 1,
				lastRow: Math.ceil((bounds.bottom - offsetY) / cellHeight) - 1
			}
			setVisibleRange(current =>
				current.firstColumn === next.firstColumn &&
				current.lastColumn === next.lastColumn &&
				current.firstRow === next.firstRow &&
				current.lastRow === next.lastRow
					? current
					: next
			)
		}
		updateRange()
		const unsubscribeX = x.on('change', updateRange)
		const unsubscribeY = y.on('change', updateRange)
		return () => {
			unsubscribeX()
			unsubscribeY()
		}
	}, [active, containerSize.w, containerSize.h, safeImageWidth, safeImageHeight, cellWidth, cellHeight, perspective, tilt, x, y])

	// 失败记录只跟随原始列表，不随重复区块累积
	useEffect(() => {
		setFailedImages(new Set())
	}, [safeItems])

	// 只预解码首屏封面，后续进入视口的图片独立加载
	useEffect(() => {
		if (!active || imagesReady || containerSize.w <= 0 || containerSize.h <= 0) return
		const el = containerRef.current
		if (!el) return
		let cancelled = false
		const images = new Map<string, HTMLImageElement>()
		el.querySelectorAll<HTMLImageElement>('[data-in-viewport="true"] img').forEach(image => images.set(image.currentSrc || image.src, image))
		Promise.all(Array.from(images.values(), image => image.decode().catch(() => undefined))).then(() => {
			if (!cancelled) setImagesReady(true)
		})
		return () => {
			cancelled = true
		}
	}, [active, imagesReady, visibleRange, containerSize.w, containerSize.h, safeItems])

	// 滚轮目标连续累加，不限制横纵方向的移动范围
	useEffect(() => {
		if (!enableWheel || !active || !imagesReady) return
		const el = containerRef.current
		if (!el) return
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey) return
			event.preventDefault()
			let deltaX = event.deltaX
			let deltaY = event.deltaY
			if (event.shiftKey && deltaX === 0) {
				deltaX = deltaY
				deltaY = 0
			}
			if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
				deltaX *= 16
				deltaY *= 16
			} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
				deltaX *= containerSize.w
				deltaY *= containerSize.h
			}
			if (deltaX === 0 && deltaY === 0) return
			const target: Point = {
				x: (wheelTarget.current?.x ?? x.get()) - deltaX,
				y: (wheelTarget.current?.y ?? y.get()) - deltaY
			}
			dragControls.cancel()
			stopMotion()
			setIsDragging(false)
			hasMoved.current = true
			wheelTarget.current = target
			wheelAnimations.current = [
				animate(x, target.x, { duration: 0.3, ease: [0.22, 1, 0.36, 1] }),
				animate(y, target.y, {
					duration: 0.3,
					ease: [0.22, 1, 0.36, 1],
					onComplete: () => {
						if (wheelTarget.current === target) wheelTarget.current = null
					}
				})
			]
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => {
			el.removeEventListener('wheel', onWheel)
			stopMotion()
		}
	}, [enableWheel, active, imagesReady, containerSize.w, containerSize.h, dragControls, stopMotion, x, y])

	const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
		if (!active || !imagesReady || event.button !== 0 || !event.isPrimary) return
		stopMotion()
		dragControls.start(event)
	}

	// 只保留视口及四周缓冲区，不保存历史区块
	const renderCells: GridCell[] = []
	if (active && visibleRange.firstRow <= visibleRange.lastRow && visibleRange.firstColumn <= visibleRange.lastColumn) {
		for (let row = visibleRange.firstRow - safeOverscan; row <= visibleRange.lastRow + safeOverscan; row++) {
			const itemRow = ((row % blockRows) + blockRows) % blockRows
			for (let column = visibleRange.firstColumn - safeOverscan; column <= visibleRange.lastColumn + safeOverscan; column++) {
				// 正取模让负坐标也按同一区块排列，末行用列表开头补齐
				const itemColumn = ((column % blockColumns) + blockColumns) % blockColumns
				renderCells.push({ column, row, index: (itemRow * blockColumns + itemColumn) % safeItems.length })
			}
		}
	}

	const wrapperStyle: CSSProperties = {
		position: 'relative',
		width: '100%',
		height: '100%',
		minWidth: 600,
		minHeight: 600,
		margin: 0,
		boxSizing: 'border-box',
		overflow: 'hidden',
		perspective: tilt ? perspective : undefined,
		perspectiveOrigin: '50% 50%',
		touchAction: 'none',
		userSelect: 'none',
		cursor: isDragging ? 'grabbing' : 'grab',
		...style
	}

	return (
		<div ref={containerRef} aria-busy={active && !imagesReady} onPointerDown={handlePointerDown} style={wrapperStyle}>
			{active && !imagesReady && (
				<div className="pointer-events-none absolute inset-0 grid place-items-center text-neutral-500">
					<Spinner className="size-6" aria-label="正在准备封面" />
				</div>
			)}
			<motion.div
				transformTemplate={tilt ? (_, transform) => `rotateX(${tiltX}deg) rotateY(${tiltY}deg) ${transform === 'none' ? '' : transform}` : undefined}
				style={{
					position: 'absolute',
					inset: 0,
					x,
					y,
					transformOrigin: '50% 50%',
					transformStyle: tilt ? 'preserve-3d' : undefined,
					opacity: imagesReady ? 1 : 0,
					willChange: 'transform'
				}}
				drag={active && imagesReady}
				dragControls={dragControls}
				dragListener={false}
				dragMomentum
				onDragStart={() => {
					hasMoved.current = true
					setIsDragging(true)
				}}
				onDragEnd={() => setIsDragging(false)}
			>
				{renderCells.map(({ column, row, index }) => {
					const inViewport =
						column >= visibleRange.firstColumn && column <= visibleRange.lastColumn && row >= visibleRange.firstRow && row <= visibleRange.lastRow
					const item = safeItems[index]
					const src = item.image?.src
					const alt = item.alt ?? item.image?.alt ?? item.name ?? ''
					const failed = src ? failedImages.has(src) : false
					return (
						<motion.div
							key={`${row}:${column}`}
							data-in-viewport={inViewport}
							onTap={imagesReady && onItemClick ? () => onItemClick(item, index) : undefined}
							style={{
								position: 'absolute',
								left: column * cellWidth,
								top: row * cellHeight,
								width: safeImageWidth,
								height: safeImageHeight,
								perspective: 1000
							}}
						>
							<div
								className={styles.cover}
								data-entering={inViewport && active && imagesReady && !hasMoved.current}
								style={{
									position: 'relative',
									width: '100%',
									height: '100%',
									color: 'rgba(255,255,255,0.85)',
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
									fontSize: Math.max(14, Math.round(Math.min(safeImageWidth, safeImageHeight) * 0.16)),
									fontWeight: 600,
									cursor: isDragging ? 'grabbing' : 'pointer',
									animationDelay: `${(index % 8) * 50}ms`
								}}
							>
								<TiltedCard
									imageSrc={failed ? undefined : src}
									srcSet={item.image?.srcSet}
									altText={alt}
									name={item.name}
									artists={item.artists}
									duration={item.duration}
									radius={radius}
									smoothness={0}
									backgroundColor={src && !failed ? placeholderColor : getItemColor(index)}
									fetchPriority={inViewport ? 'high' : 'low'}
									playing={Boolean(item.id && item.id === activeItemId)}
									onImageError={() => {
										if (src) setFailedImages(current => (current.has(src) ? current : new Set(current).add(src)))
									}}
								>
									{src && !failed ? (
										<Spinner className="relative z-0 size-8" aria-label="正在加载封面" />
									) : (
										<span className="relative z-0 text-sm">暂无封面</span>
									)}
								</TiltedCard>
							</div>
						</motion.div>
					)
				})}
			</motion.div>
		</div>
	)
}
