import { execSync } from 'node:child_process'
import type { RadioSong } from '@neon-radio/protocol'
import fastifyCookie from '@fastify/cookie'
import fastifyExpress from '@fastify/express'
import fastifyRateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { closeAudioAnalysis, queueMissingSongs, setSourceResolver } from './audio/index.js'
import config, { validateConfig } from './config.js'
import browserAuth, { clearExpiredBrowserToken } from './guards/auth.js'
import neteaseQrCompat from './guards/netease-qr-compat.js'
import sameOriginGuard from './guards/same-origin.js'
import initLive from './live/index.js'
import { closeRadioPlayback, initRadioPlayback, resolveAudioSrc } from './modules/playback/index.js'
import { getRoamingSongs, publishRoamingSongs, songsEvents, waitForRoamingSync } from './modules/roaming/index.js'
import { clearQrCache, getSessionStatus, initSession, refreshSession, waitForSessionUpdates } from './modules/session/index.js'
import { initSettings } from './modules/settings/index.js'
import { closeDatabase, initDatabase } from './platform/db.js'
import indexRoutes from './routes/index.js'
import generateNcmConfig from './vendor/ncm-api/generateConfig.js'
import ncmApi from './vendor/ncm-api/main.js'

// 仅为 Windows 终端切换 UTF-8 代码页
if (process.platform === 'win32' && process.stdout.isTTY) {
	try {
		execSync('chcp 65001', { stdio: 'ignore' })
	} catch {
		console.warn('终端代码页切换失败，请手动执行 chcp 65001')
	}
}

const fastify = Fastify({
	trustProxy: 'loopback',
	logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] }
})

// 歌曲列表变化后补齐缺失的音频时间轴，未登录时等待下一次同步
const queueAnalysis = (songs: RadioSong[]) => {
	if (getSessionStatus().loggedIn) queueMissingSongs(songs)
}

try {
	validateConfig()
	// 先完成建库和迁移，业务模块才能读取已保存的登录态和配置
	await initDatabase()
	await initSession()
	await initSettings()

	// 音频层只依赖业务层注入的取链函数
	setSourceResolver(resolveAudioSrc)
	songsEvents.on('change', queueAnalysis)
	initRadioPlayback()
	// 建连前加载已入库快照，首屏无需等待下一次刷新
	await publishRoamingSongs()
	queueAnalysis(getRoamingSongs())

	await fastify.register(fastifyCookie)
	await fastify.register(fastifyRateLimit, {
		global: false,
		errorResponseBuilder: (_request, context) => ({ code: 429, message: `请求过于频繁，请 ${Math.ceil(context.ttl / 1000)} 秒后重试` })
	})
	fastify.setNotFoundHandler(async (_request, reply) => {
		return reply.header('Cache-Control', 'no-store').code(404).send({ code: 404, message: '404 未知访问路径' })
	})
	// 同源校验、登录会话和原生扫码兼容都在业务路由之前执行
	fastify.addHook('onRequest', sameOriginGuard)
	fastify.addHook('onRequest', browserAuth)
	fastify.addHook('onRequest', neteaseQrCompat)
	fastify.addHook('onSend', clearExpiredBrowserToken)
	await fastify.register(fastifyExpress) // 兼容 express
	// 复用库内启动初始化，生成 xeapi 公钥后再挂载网易云接口
	await generateNcmConfig()
	fastify.use('/neon-radio/ncm', await ncmApi.constructServer())
	await fastify.register(indexRoutes, { prefix: '/neon-radio' })
	initLive(fastify)

	// 定时刷新网易云 Cookie，失败只记录日志，等待下一次重试
	const timer = setInterval(
		() => {
			void refreshSession().catch(() => fastify.log.warn('电台 Cookie 定时刷新失败'))
		},
		config.COOKIE_REFRESH_HOURS * 60 * 60 * 1000
	)
	timer.unref()

	fastify.addHook('onClose', async () => {
		clearInterval(timer)
		songsEvents.off('change', queueAnalysis)
		closeRadioPlayback()
		clearQrCache()
		// 会话和漫游同步可能安排分析，先等待它们，再结束音频分析任务
		await waitForSessionUpdates()
		await waitForRoamingSync()
		await closeAudioAnalysis()
		await closeDatabase()
	})

	fastify.listen({ port: config.API_PORT }, (_err, address) => {
		console.log(`
███╗   ██╗███████╗ ██████╗ ███╗   ██╗    ██████╗  █████╗ ██████╗ ██╗ ██████╗ 
████╗  ██║██╔════╝██╔═══██╗████╗  ██║    ██╔══██╗██╔══██╗██╔══██╗██║██╔═══██╗
██╔██╗ ██║█████╗  ██║   ██║██╔██╗ ██║    ██████╔╝███████║██║  ██║██║██║   ██║
██║╚██╗██║██╔══╝  ██║   ██║██║╚██╗██║    ██╔══██╗██╔══██║██║  ██║██║██║   ██║
██║ ╚████║███████╗╚██████╔╝██║ ╚████║    ██║  ██║██║  ██║██████╔╝██║╚██████╔╝
╚═╝  ╚═══╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝    ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝
──────────────────────────────────
★ 	Status: Online 		★
★ 	Port: ${config.API_PORT} 		★
★ 	Env: ${process.env.NODE_ENV || 'development'} 	★
★ 	System: ${process.platform} 		★
──────────────────────────────────
`)
		console.log(`[Neon Radio] ${address}/neon-radio`)
		console.log(`[NCM API] ${address}/neon-radio/ncm`)
	})
} catch (err) {
	fastify.log.error(err)
	process.exit(1)
}
