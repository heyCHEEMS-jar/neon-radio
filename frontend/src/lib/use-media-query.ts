'use client'

import { useCallback, useSyncExternalStore } from 'react'

// 订阅媒体查询；服务端先按 false 渲染，客户端挂载后切到真实值
export function useMediaQuery(query: string) {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const media = window.matchMedia(query)
			media.addEventListener('change', onChange)
			return () => media.removeEventListener('change', onChange)
		},
		[query]
	)
	const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
	return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
