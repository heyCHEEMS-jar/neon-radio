import type { FastifyInstance } from 'fastify'
import config from '../config.js'
import { initRoamingSongRepository } from '../repositories/roaming-song.js'
import { initSongImpactsRepository } from '../repositories/song-impacts.js'
import { initRadioOptions } from '../services/radio/options.js'
import { closeAudioAnalysis, initAudioAnalysis } from '../services/radio/audio-analysis.js'
import { closeRadioPlayback, initRadioPlayback } from '../services/radio/playback.js'
import { publishRoamingSongs, waitForRoamingSync } from '../services/radio/roaming-sync.js'
import { initSession, refreshSession, waitForSessionUpdates } from '../services/session/netease-session.js'
import { clearQrCache } from '../services/session/qr-code.js'
import { closeDatabase } from '../utils/db.js'
import initRadioLive from '../websocket/radio-live.js'

// 统一管理服务初始化、定时刷新和资源释放，路由只注册接口
export default async function radioPlugin(fastify: FastifyInstance) {
	await initSession()
	// 会话初始化已保证数据库可用，独立的表初始化并行执行
	await Promise.all([initRoamingSongRepository(), initSongImpactsRepository(), initRadioOptions()])
	// 先订阅入库列表，启动加载也会补齐缺失的音频分析时间轴
	initAudioAnalysis()
	// 建连前加载已入库快照，首屏无需等待下一次刷新
	await publishRoamingSongs()
	initRadioPlayback()
	initRadioLive(fastify)

	const timer = setInterval(
		() => {
			void refreshSession().catch(() => fastify.log.warn('电台 Cookie 定时刷新失败'))
		},
		config.COOKIE_REFRESH_HOURS * 60 * 60 * 1000
	)
	timer.unref()
	fastify.addHook('onClose', async () => {
		clearInterval(timer)
		closeRadioPlayback()
		clearQrCache()
		// 会话和漫游同步可能安排分析，先等待它们，再结束音频分析任务
		await waitForSessionUpdates()
		await waitForRoamingSync()
		await closeAudioAnalysis()
		await closeDatabase()
	})
}
