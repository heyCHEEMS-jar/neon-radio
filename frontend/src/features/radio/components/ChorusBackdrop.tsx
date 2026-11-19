'use client'

import dynamic from 'next/dynamic'
import { useContext, useEffect, useRef, useState } from 'react'
import { RadioAudioContext } from '@/audio'
import useChorus from '@/features/radio/chorus/useChorus'
import { RadioLiveContext } from '@/features/radio/live/useRadioLive'
import { RoamingContext } from '@/features/radio/scene'

// WebGL 只在浏览器加载，避免进入服务端渲染和首屏包
const LightPillar = dynamic(() => import('@/components/ui/light-pillar'), { ssr: false, loading: () => null })

// 副歌段的光柱层；WebGL2 不可用时静默跳过
export default function ChorusBackdrop() {
	const audio = useContext(RadioAudioContext)
	const live = useContext(RadioLiveContext)
	const roaming = useContext(RoamingContext)
	const [armed, setArmed] = useState(false)
	const [entrance, setEntrance] = useState(0)
	const fallbackRef = useRef<HTMLAudioElement | null>(null)
	const audioRef = audio?.audioRef ?? fallbackRef
	const songId = live?.playback?.song?.id
	const enabled = Boolean(audio?.started && songId)
	const { range, inChorus } = useChorus(songId, audioRef, enabled)

	// 首次拿到副歌数据后保持挂载，避免切歌时反复创建 WebGL 上下文
	useEffect(() => {
		if (range) setArmed(true)
	}, [range])

	// 每次真正进入副歌时触发一次入场动画
	useEffect(() => {
		if (inChorus && !roaming) setEntrance(value => value + 1)
	}, [inChorus, roaming])

	if (!armed) return null
	// 漫游弹窗打开时主界面被完全盖住，暂停图层避免空转
	const active = !roaming && inChorus

	return (
		<div className={`pointer-events-none absolute inset-0 z-0 transition-opacity duration-700 ${active ? 'opacity-100' : 'opacity-0'}`}>
			<LightPillar
				topColor="#00F0FF"
				bottomColor="#FF2BD6"
				intensity={1}
				glowAmount={0.002}
				bloom={0.5}
				pillarWidth={3}
				pillarHeight={0.4}
				pillarRotation={25}
				rotationSpeed={0.3}
				interactive={false}
				clickPulse={false}
				intro
				introDuration={3.2}
				quality="high"
				mixBlendMode="screen"
				paused={!active}
				entranceKey={entrance}
			/>
		</div>
	)
}
