'use client'

import { useContext, useEffect, useRef } from 'react'
import { RadioSceneContext } from '@/features/radio/scene'

export default function Video() {
	const active = useContext(RadioSceneContext)
	const videoRef = useRef<HTMLVideoElement>(null)

	// 隐藏时暂停，恢复时沿用原来的播放位置
	useEffect(() => {
		const video = videoRef.current
		if (!video) return
		if (!active) video.pause()
		else video.play().catch(() => undefined)
	}, [active])

	return (
		<>
			<link rel="preload" as="image" href="/images/thumb_background.webp" fetchPriority="high" />
			<video
				ref={videoRef}
				className="pointer-events-none fixed inset-0 z-0 block h-svh w-full bg-black object-cover object-center"
				poster="/images/thumb_background.webp"
				autoPlay={active}
				loop
				muted
				playsInline
				preload="auto"
				aria-hidden="true"
			>
				<source src="/videos/loop.webm" type="video/webm" />
			</video>
		</>
	)
}
