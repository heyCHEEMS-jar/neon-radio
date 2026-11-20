import type { MetadataRoute } from 'next'
import { siteDescription, siteName } from '@/lib/site'

// 手机「添加到主屏幕」读取的配置，图标放在 public 下供 manifest 直接引用
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: siteName,
		short_name: siteName,
		description: siteDescription,
		start_url: '/',
		display: 'standalone',
		background_color: '#000000',
		theme_color: '#000000',
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
		]
	}
}
