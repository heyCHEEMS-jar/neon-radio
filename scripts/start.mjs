import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT_DIR = import.meta.dirname
const FRONTEND_DIR = path.join(ROOT_DIR, '..', 'frontend')
const LOGS_DIR = path.join(ROOT_DIR, '..', 'logs')
const envPath = path.join(ROOT_DIR, '..', '.env')

if (!fs.existsSync(envPath)) {
	console.error('\n.env 文件不存在！请根据根目录下的 .env.example 创建 .env 并配置环境变量。\n')
	process.exit(1)
}
process.loadEnvFile(envPath)

const requestedTool = process.env.PACKAGE_TOOL || 'pnpm'
const packageTool = ['pnpm', 'npm', 'yarn'].includes(requestedTool) ? requestedTool : 'pnpm'
if (packageTool !== requestedTool) console.warn(`未知的包管理器 ${requestedTool}，已回退到 pnpm`)

// 各包管理器的目录参数不同，API 进程通过 server 的 start 脚本启动
const packageBinary = process.platform === 'win32' ? `${packageTool}.cmd` : packageTool
const serverArgs = packageTool === 'npm' ? ['--prefix', 'server', 'run', 'start'] : packageTool === 'yarn' ? ['--cwd', 'server', 'start'] : ['--dir', 'server', 'start']

// 生产构建失败时直接退出，不启动旧产物
const build = spawnSync(packageBinary, ['run', 'build'], { stdio: 'inherit', shell: true, cwd: FRONTEND_DIR, env: { ...process.env, NODE_ENV: 'production' } })
if (build.status !== 0) {
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

	// 两个进程都由 PM2 托管，日志写入根目录 logs/
	pm2.start(
		[
			{
				script: packageBinary,
				args: serverArgs,
				interpreter: 'none',
				cwd: path.join(ROOT_DIR, '..'),
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
				env: { ...process.env, NODE_ENV: 'production', PORT: process.env.WEB_PORT || '3003' },
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
