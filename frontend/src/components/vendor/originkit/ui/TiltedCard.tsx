'use client'

import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useState, type CSSProperties, type ImgHTMLAttributes, type PointerEvent, type ReactNode } from 'react'
import { useI18n } from '@/i18n/context'
import styles from '@/styles/tilted-card.module.css'

interface TiltedCardProps {
	imageSrc?: string
	altText?: string
	name?: string
	artists?: string[]
	duration?: number
	srcSet?: string
	fetchPriority?: ImgHTMLAttributes<HTMLImageElement>['fetchPriority']
	onImageError?: ImgHTMLAttributes<HTMLImageElement>['onError']
	playing?: boolean
	backgroundColor?: string
	radius?: number
	rotateAmplitude?: number
	scaleOnHover?: number
	smoothness?: number
	onClick?: () => void
	children?: ReactNode
	className?: string
	style?: CSSProperties
}

// 单面封面卡片，触摸和拖动时不跟随指针倾斜
export default function TiltedCard({
	imageSrc,
	altText = '',
	name,
	artists = [],
	duration,
	srcSet,
	fetchPriority = 'auto',
	onImageError,
	playing = false,
	backgroundColor = '#1a1a1f',
	radius = 15,
	rotateAmplitude = 12,
	scaleOnHover = 1.05,
	smoothness = 0.6,
	onClick,
	children,
	className,
	style
}: TiltedCardProps) {
	const { t } = useI18n()
	const reducedMotion = useReducedMotion()
	// 按封面来源记录加载结果，网格复用卡片时不沿用旧图片的加载状态
	const [loadedImage, setLoadedImage] = useState<{ src: string; srcSet?: string } | null>(null)
	const imageLoaded = Boolean(imageSrc && loadedImage?.src === imageSrc && loadedImage.srcSet === srcSet)
	const artistNames = artists.join(' / ')
	// 时长按毫秒接收，卡片显示为 mm:ss
	const seconds = typeof duration === 'number' && Number.isFinite(duration) && duration >= 0 ? Math.floor(duration / 1000) : null
	const durationText = seconds === null ? '' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
	const smoothing = Math.max(0, Math.min(1, smoothness))
	const omega = 20 * Math.pow(0.2, smoothing)
	const spring = { stiffness: omega * omega, damping: 2 * (1 - 0.3 * smoothing) * omega }
	const x = useSpring(50, spring)
	const y = useSpring(50, spring)
	const scale = useSpring(1, spring)
	const amplitude = reducedMotion ? 0 : Math.max(0, Math.min(60, rotateAmplitude))
	const rotateX = useTransform(y, [0, 100], [amplitude, -amplitude])
	const rotateY = useTransform(x, [0, 100], [-amplitude, amplitude])

	// 离开卡片或开始拖动时恢复角度和缩放
	const reset = () => {
		x.set(50)
		y.set(50)
		scale.set(1)
	}

	// 鼠标悬停时调整角度和缩放，触摸与拖动不触发
	const followPointer = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'touch' || event.buttons !== 0) return
		const rect = event.currentTarget.getBoundingClientRect()
		if (!rect.width || !rect.height) return
		x.set(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)))
		y.set(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)))
		scale.set(reducedMotion ? 1 : Math.max(0.5, scaleOnHover))
	}

	return (
		<div
			className={[styles.card, className].filter(Boolean).join(' ')}
			style={style}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
			aria-label={onClick ? altText || t('cover.play') : undefined}
			onClick={onClick}
			onKeyDown={event => {
				if (!onClick || event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
				event.preventDefault()
				if (!event.repeat) onClick()
			}}
			onPointerEnter={followPointer}
			onPointerMove={followPointer}
			onPointerDown={reset}
			onPointerLeave={reset}
			onPointerCancel={reset}
		>
			<motion.div
				className={styles.body}
				data-playing={playing || undefined}
				style={{ rotateX, rotateY, scale, borderRadius: radius, backgroundColor }}
			>
				{!imageLoaded && children}
				{playing && <span className={styles.playing}>{t('cover.playing')}</span>}
				{imageSrc && (
					<img
						className={styles.image}
						style={{ opacity: imageLoaded ? 1 : 0 }}
						src={imageSrc}
						srcSet={srcSet}
						alt={altText}
						draggable={false}
						loading="eager"
						decoding="async"
						fetchPriority={fetchPriority}
						onLoad={() => setLoadedImage({ src: imageSrc, srcSet })}
						onError={onImageError}
					/>
				)}
				{(name || artistNames || durationText) && (
					<div className={styles.info}>
						{name && (
							<span className={styles.name} title={name}>
								{name}
							</span>
						)}
						{(artistNames || durationText) && (
							<div className={styles.metadata}>
								{artistNames && (
									<span className={styles.artists} title={artistNames}>
										{artistNames}
									</span>
								)}
								{durationText && <span className={styles.duration}>{durationText}</span>}
							</div>
						)}
					</div>
				)}
				<span className={styles.rim} aria-hidden="true" />
			</motion.div>
		</div>
	)
}
