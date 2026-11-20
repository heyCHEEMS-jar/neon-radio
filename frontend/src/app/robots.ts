import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

// 允许抓取页面与静态资源，只屏蔽接口代理，避免爬虫把 JSON 当页面收录
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
			disallow: '/neon-radio/'
		},
		sitemap: `${siteUrl}sitemap.xml`
	}
}
