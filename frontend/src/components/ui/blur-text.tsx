'use client'

import { gsap } from 'gsap'
import { useCallback, useEffect, useRef, type CSSProperties } from 'react'

interface BlurTextProps {
	text?: string
	animateBy?: 'letter' | 'word'
	from?: string | number
	scale?: number
	blur?: number
	yOffset?: number
	duration?: number
	charDelay?: number
	wordDelay?: number
	repeat?: boolean
	color?: string
	gradient?: string
	fontSize?: string
	className?: string
}

// 逐字/逐词从模糊放大进入的标题，文本变化需要通过 key 重新挂载
export default function BlurText({
	text = 'IMPACT',
	animateBy = 'letter',
	from = 'center',
	scale = 4,
	blur = 8,
	yOffset = 0,
	duration = 0.8,
	charDelay = 0.06,
	wordDelay = 0.15,
	repeat = false,
	color = '#ffffff',
	gradient = '',
	fontSize = 'text-6xl',
	className = ''
}: BlurTextProps) {
	const containerRef = useRef<HTMLDivElement>(null)
	const timelineRef = useRef<gsap.core.Timeline | null>(null)
	const gradientStyle: CSSProperties = gradient
		? { backgroundImage: gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }
		: { color }
	const words = animateBy === 'word' ? text.split(/\s+/).filter(Boolean) : []
	const chars = animateBy === 'letter' ? [...text] : []

	// 重新初始化为起始状态，再按 stagger 顺序播放进入动画
	const buildTimeline = useCallback(() => {
		const container = containerRef.current
		if (!container) return
		const selector = animateBy === 'word' ? '.explode-word' : '.explode-char'
		const elements = container.querySelectorAll(selector)
		if (!elements.length) return
		if (timelineRef.current) timelineRef.current.kill()
		gsap.set(elements, { scaleX: scale, scaleY: scale, opacity: 0, filter: `blur(${blur}px)`, y: yOffset, transformOrigin: '50% 50%' })
		const staggerDelay = animateBy === 'word' ? wordDelay : charDelay
		const timeline = gsap.timeline({
			repeat: repeat ? -1 : 0,
			repeatDelay: 1,
			onRepeat() {
				gsap.set(elements, { scaleX: scale, scaleY: scale, opacity: 0, filter: `blur(${blur}px)`, y: yOffset })
			}
		})
		timeline.to(elements, {
			scaleX: 1,
			scaleY: 1,
			opacity: 1,
			filter: 'blur(0px)',
			y: 0,
			stagger: { each: staggerDelay, from: from as gsap.StaggerVars['from'] },
			ease: 'expo.out',
			duration
		})
		timelineRef.current = timeline
	}, [animateBy, blur, charDelay, duration, from, repeat, scale, wordDelay, yOffset])

	useEffect(() => {
		buildTimeline()
		return () => {
			timelineRef.current?.kill()
		}
	}, [buildTimeline])

	return (
		<div className={`flex flex-col items-center gap-6 ${className}`}>
			<div ref={containerRef} className="flex flex-wrap items-center justify-center">
				{animateBy === 'word'
					? words.map((word, index) => (
							<span
								key={index}
								className={`explode-word inline-block select-none font-black leading-none tracking-tight ${fontSize}`}
								style={{ opacity: 0, ...gradientStyle }}
							>
								{word}
								{index < words.length - 1 && <span style={{ display: 'inline-block', minWidth: '0.35em' }}>{'\u00A0'}</span>}
							</span>
						))
					: chars.map((char, index) => (
							<span
								key={index}
								className={`explode-char inline-block select-none font-black leading-none tracking-tight ${fontSize}`}
								style={{ opacity: 0, minWidth: char === ' ' ? '0.35em' : undefined, ...gradientStyle }}
							>
								{char === ' ' ? '\u00a0' : char}
							</span>
						))}
			</div>
		</div>
	)
}
