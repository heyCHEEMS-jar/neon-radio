import path from 'node:path'
import fs from 'node:fs'
import { exec, spawn, spawnSync } from 'node:child_process'

const ROOT_DIR = import.meta.dirname
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend')
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'app.ts')
const LOGS_DIR = path.join(ROOT_DIR, 'logs')
const envPath = path.join(ROOT_DIR, '.env')

if (!fs.existsSync(envPath)) {
	console.error('\n.env 文件不存在！请根据根目录下的 .env.example 创建 .env 文件并配置相应的环境变量。\n')
	process.exit(1)
}
process.loadEnvFile(envPath)

const isProd = process.argv.includes('--prod')
const packageTool = process.env.PACKAGE_TOOL || 'pnpm'

const getPackageCmd = command => {
	if (packageTool === 'pnpm') return ['pnpm', [command]]
	if (packageTool === 'npm') return ['npm', command === 'install' ? ['install'] : ['run', command]]
	if (packageTool === 'yarn') return ['yarn', [command]]
	console.warn('未知的包管理器:', packageTool)
	return ['pnpm', [command]]
}

const [installCmd, installArgs] = getPackageCmd('install')
const installResult = spawnSync(installCmd, installArgs, {
	stdio: 'inherit',
	shell: true,
	cwd: ROOT_DIR
})

if (installResult.status !== 0) {
	console.error('\n项目依赖安装更新失败！\n')
	process.exit(1)
}

if (!isProd) {
	const [devCmd, devArgs] = getPackageCmd('dev')
	const frontend = spawn(devCmd, devArgs, {
		stdio: 'inherit',
		shell: true,
		cwd: FRONTEND_DIR,
		env: {
			...process.env,
			NODE_ENV: 'development',
			PORT: process.env.WEB_PORT || '3003'
		}
	})
	const server = spawn('npx', ['tsx', 'watch', SERVER_ENTRY], {
		stdio: 'inherit',
		shell: true,
		cwd: ROOT_DIR,
		env: {
			...process.env,
			NODE_ENV: 'development'
		}
	})

	const killAll = () => {
		if (process.platform === 'win32') {
			if (server.pid) exec(`taskkill /F /T /PID ${server.pid}`)
			if (frontend.pid) exec(`taskkill /F /T /PID ${frontend.pid}`)
			process.exit(0)
		}
		server.kill()
		frontend.kill()
		setTimeout(() => process.exit(0), 1500)
	}

	process.on('SIGINT', killAll)
	process.on('SIGTERM', killAll)
} else {
	const [buildCmd, buildArgs] = getPackageCmd('build')
	const buildResult = spawnSync(buildCmd, buildArgs, {
		stdio: 'inherit',
		shell: true,
		cwd: FRONTEND_DIR,
		env: {
			...process.env,
			NODE_ENV: 'production'
		}
	})

	if (buildResult.status !== 0) {
		console.error('\n前端构建失败！已停止启动服务。\n')
		process.exit(1)
	}

	fs.mkdirSync(LOGS_DIR, { recursive: true })
	const { default: pm2 } = await import('pm2')
	pm2.connect(error => {
		if (error) {
			console.error('PM2 连接失败:', error)
			process.exit(1)
		}

		pm2.start(
			[
				{
					script: 'npx',
					args: ['tsx', SERVER_ENTRY],
					interpreter: 'none',
					cwd: ROOT_DIR,
					name: 'neon-radio-api',
					env: { ...process.env, NODE_ENV: 'production' },
					output: path.join(LOGS_DIR, 'api-out.log'),
					error: path.join(LOGS_DIR, 'api-error.log'),
					merge_logs: true
				},
				{
					script: packageTool,
					args: ['start'],
					interpreter: 'none',
					cwd: FRONTEND_DIR,
					name: 'neon-radio-web',
					env: {
						...process.env,
						NODE_ENV: 'production',
						PORT: process.env.WEB_PORT || '3003'
					},
					output: path.join(LOGS_DIR, 'web-out.log'),
					error: path.join(LOGS_DIR, 'web-error.log'),
					merge_logs: true
				}
			],
			startError => {
				if (startError) console.error('PM2 进程启动失败:', startError)
				else {
					console.log('\nNext.js 与 API 服务已由 PM2 启动。\n')
					spawnSync('pm2', ['list'], { stdio: 'inherit', shell: true })
				}
				pm2.disconnect()
				process.exit(startError ? 1 : 0)
			}
		)
	})
}
