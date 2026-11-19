import { createContext } from 'react'
import type { RadioAudioState } from './types'

// 音频只通过这个上下文暴露播放状态和只读采样函数
export const RadioAudioContext = createContext<RadioAudioState | null>(null)
