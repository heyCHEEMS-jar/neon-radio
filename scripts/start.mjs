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

// 构建仍走包管理器；PM2 直接跑 node 入口，避免 spawn .cmd 在 Windows 抛 EINVAL
const packageBinary = process.platform === 'win32' ? `${packageTool}.cmd` : packageTool
const ROOT = path.join(ROOT_DIR, '..')
const serverEntry = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const serverArg = path.join(ROOT, 'server', 'app.ts')
const webEntry = path.join(FRONTEND_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')

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
				script: serverEntry,
				args: [serverArg],
				interpreter: 'node',
				cwd: path.join(ROOT_DIR, '..'),
				name: 'neon-radio-api',
				env: { ...process.env, NODE_ENV: 'production' },
				output: path.join(LOGS_DIR, 'api-out.log'),
				error: path.join(LOGS_DIR, 'api-error.log'),
				merge_logs: true
			},
			{
				script: webEntry,
				args: ['start'],
				interpreter: 'node',
				cwd: FRONTEND_DIR,
				name: 'neon-radio-web',
				env: { ...process.env, NODE_ENV: 'production', PORT: process.env.WEB_PORT || '3003' },
				output: path.join(LOGS_DIR, 'web-out.log'),
				error: path.join(LOGS_DIR, 'web-error.log'),
				merge_logs: true
			}
		],
		startError => {
			if (startError) {
				console.error('PM2 进程启动失败:', startError)
				pm2.disconnect()
				process.exit(1)
			}
			// start 回调只代表指令已下发，再查一次真实状态，避免启动失败仍报成功
			pm2.list((listError, list) => {
				if (listError) console.error('PM2 状态查询失败:', listError)
				spawnSync('pm2', ['list'], { stdio: 'inherit', shell: true })
				const failed = (list || []).filter(item => item.pm2_env?.status !== 'online')
				if (failed.length) console.error('\n以下进程未能进入 online 状态:', failed.map(item => item.name).join(', '), '\n请查看 logs/ 下的错误日志。')
				pm2.disconnect()
				process.exit(failed.length || listError ? 1 : 0)
			})
		}
	)
})
