'use client'

import { motion, useMotionTemplate, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import type { CSSProperties, ImgHTMLAttributes, PointerEvent, ReactNode } from 'react'
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
	backgroundColor?: string
	radius?: number
	rotateAmplitude?: number
	scaleOnHover?: number
	smoothness?: number
	glare?: number
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
	backgroundColor = '#1a1a1f',
	radius = 15,
	rotateAmplitude = 12,
	scaleOnHover = 1.05,
	smoothness = 0.6,
	glare = 0.5,
	onClick,
	children,
	className,
	style
}: TiltedCardProps) {
	const reducedMotion = useReducedMotion()
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
	const highlight = useSpring(0, spring)
	const amplitude = reducedMotion ? 0 : Math.max(0, Math.min(60, rotateAmplitude))
	const rotateX = useTransform(y, [0, 100], [amplitude, -amplitude])
	const rotateY = useTransform(x, [0, 100], [-amplitude, amplitude])
	const light = useMotionTemplate`radial-gradient(circle at ${x}% ${y}%, rgba(255, 255, 255, 0.55), transparent 65%)`

	const reset = () => {
		x.set(50)
		y.set(50)
		scale.set(1)
		highlight.set(0)
	}

	const followPointer = (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType === 'touch' || event.buttons !== 0) return
		const rect = event.currentTarget.getBoundingClientRect()
		if (!rect.width || !rect.height) return
		x.set(Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)))
		y.set(Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)))
		scale.set(reducedMotion ? 1 : Math.max(0.5, scaleOnHover))
		highlight.set(Math.max(0, Math.min(1, glare)))
	}

	return (
		<div
			className={[styles.card, className].filter(Boolean).join(' ')}
			style={style}
			role={onClick ? 'button' : undefined}
			tabIndex={onClick ? 0 : undefined}
			aria-label={onClick ? altText || '播放歌曲' : undefined}
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
			<motion.div className={styles.body} style={{ rotateX, rotateY, scale, borderRadius: radius, backgroundColor }}>
				{children}
				{imageSrc && (
					<img
						className={styles.image}
						src={imageSrc}
						srcSet={srcSet}
						alt={altText}
						draggable={false}
						loading="eager"
						decoding="async"
						fetchPriority={fetchPriority}
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
				<motion.span className={styles.glare} aria-hidden="true" style={{ background: light, opacity: highlight }} />
				<span className={styles.rim} aria-hidden="true" />
			</motion.div>
		</div>
	)
}
