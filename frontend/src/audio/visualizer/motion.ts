let enabled = true

// 场景晃动是浏览器端视觉偏好，进程内共享，由菜单切换并在挂载时恢复
export function isSceneMotionEnabled() {
	return enabled
}

export function setSceneMotionEnabled(value: boolean) {
	enabled = value
}

export const sceneMotionStorageKey = 'scene-motion'
