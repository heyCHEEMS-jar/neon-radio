'use client'

import { useContext, useEffect, useRef } from 'react'
import { RadioSceneContext } from '@/components/radio/Radio'

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
		<video
			ref={videoRef}
			className="pointer-events-none fixed inset-0 z-0 block h-svh w-full bg-black object-cover object-center"
			autoPlay
			loop
			muted
			playsInline
			preload="auto"
			aria-hidden="true"
		>
			<source src="/videos/loop.webm" type="video/webm" />
		</video>
	)
}
