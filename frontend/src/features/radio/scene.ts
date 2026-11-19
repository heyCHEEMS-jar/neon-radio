import { createContext, type RefObject } from 'react'

// 主界面是否处于可播放场景，Video 和 Visuals 共同读取
export const RadioSceneContext = createContext(true)

// 整块场景层（背景 + 可视化），用于固定放大和轻微环境位移
export const SceneRefContext = createContext<RefObject<HTMLDivElement | null> | null>(null)
