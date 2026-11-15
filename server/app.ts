// Import the framework and instantiate it
import { execSync } from 'node:child_process'
import Fastify from 'fastify'
import fastifyExpress from '@fastify/express'
import config from './config.js'
import ncmApi from './ncm-api/main.js'
import indexRoutes from './routes/index.js'
import useQrInterceptor from './hooks/useQrInterceptor.js'

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

try {
	fastify.setNotFoundHandler(async (_request, reply) => {
		return reply.header('Cache-Control', 'no-store').code(404).send({ code: 404, message: '404 未知访问路径' })
	})
	fastify.addHook('onRequest', useQrInterceptor)
	await fastify.register(fastifyExpress) // 兼容 express
	fastify.use('/neon-radio/ncm', await ncmApi.constructServer())
	await fastify.register(indexRoutes, { prefix: '/neon-radio' })

	fastify.listen({ port: config.API_PORT }, (_err, address) => {
		console.log(`
██╗  ██╗███████╗ █████╗ ██████╗ ████████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██║  ██║
███████║█████╗  ███████║██████╔╝   ██║   ███████║
██╔══██║██╔══╝  ██╔══██║██╔══██╗   ██║   ██╔══██║
██║  ██║███████╗██║  ██║██║  ██║   ██║   ██║  ██║
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
                                                 
██████╗  █████╗ ██████╗ ██╗ ██████╗              
██╔══██╗██╔══██╗██╔══██╗██║██╔═══██╗             
██████╔╝███████║██║  ██║██║██║   ██║             
██╔══██╗██╔══██║██║  ██║██║██║   ██║             
██║  ██║██║  ██║██████╔╝██║╚██████╔╝             
╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝
──────────────────────────────────
★ 	Status: Online 		★
★ 	Port: ${config.API_PORT} 		★
★ 	Env: ${process.env.NODE_ENV || 'development'} 	★
★ 	System: ${process.platform} 		★
──────────────────────────────────
`)
		console.log(`Neon Radio: ${address}/neon-radio`)
		console.log(`NCM API: ${address}/neon-radio/ncm`)
	})
} catch (err) {
	fastify.log.error(err)
	process.exit(1)
}
