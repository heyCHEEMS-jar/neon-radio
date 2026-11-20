import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { I18nProvider } from '@/i18n/context'
import { siteDescription, siteName, siteUrl } from '@/lib/site'
import '../styles/globals.css'

export const metadata: Metadata = {
	metadataBase: new URL(siteUrl),
	title: { default: siteName, template: `%s | ${siteName}` },
	description: siteDescription,
	alternates: { canonical: '/' },
	openGraph: {
		type: 'website',
		siteName,
		url: '/',
		title: siteName,
		description: siteDescription,
		locale: 'zh_CN',
		alternateLocale: 'en_US'
	},
	twitter: {
		card: 'summary_large_image',
		title: siteName,
		description: siteDescription
	},
	robots: { index: true, follow: true }
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html
			lang="zh-CN"
			className="m-0 min-h-full w-full min-w-[320px] bg-black text-[#f5f5f5] font-[Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [font-synthesis:none] [text-rendering:optimizeLegibility]"
		>
			<body className="m-0 min-h-svh w-full min-w-[320px] overflow-hidden bg-black">
				<I18nProvider>{children}</I18nProvider>
			</body>
		</html>
	)
}
