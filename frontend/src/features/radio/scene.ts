import { createContext, type RefObject } from 'react'

// 主界面是否处于可播放场景，Video 和 Visuals 共同读取
export const RadioSceneContext = createContext(true)

// 整块场景层（背景 + 可视化），用于固定放大和轻微环境位移
export const SceneRefContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

// 主界面是否被漫游弹窗完全盖住，用于暂停被遮挡的 WebGPU 图层
export const RoamingContext = createContext(false)
