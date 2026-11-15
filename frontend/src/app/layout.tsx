import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
	title: 'neon radio',
	description: 'A focused music experience.'
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html
			lang="zh-CN"
			className="m-0 min-h-full w-full min-w-[320px] bg-black text-[#f5f5f5] font-[Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe_UI',sans-serif] [font-synthesis:none] [text-rendering:optimizeLegibility]"
		>
			<body className="m-0 min-h-svh w-full min-w-[320px] overflow-hidden bg-black">{children}</body>
		</html>
	)
}
