import type { NextConfig } from 'next'

const apiPort = process.env.API_PORT || '4003'

const nextConfig: NextConfig = {
	reactStrictMode: true,
	async rewrites() {
		return [
			{
				source: '/neon-radio/:path*',
				destination: `http://127.0.0.1:${apiPort}/neon-radio/:path*`
			}
		]
	}
}

export default nextConfig
