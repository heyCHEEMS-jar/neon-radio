import path from 'node:path'
import fs from 'node:fs'
import { spawn, spawnSync, exec } from 'node:child_process'

const ROOT_DIR = import.meta.dirname
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend')
const SERVER_ENTRY = path.join(ROOT_DIR, 'server', 'api-enhanced-4.41.1', 'main.js')
const LOGS_DIR = path.join(ROOT_DIR, 'logs')
const envPath = path.join(ROOT_DIR, '.env')

if (!fs.existsSync(envPath)) {
	console.error('\n.env 文件不存在！请根据根目录下的 .env.example 创建 .env 文件并配置相应的环境变量。\n')
	process.exit(1)
}
process.loadEnvFile(envPath)

const isProd = process.argv.includes('--prod')
const PACKAGE_TOOL = process.env.PACKAGE_TOOL || 'pnpm'

const getPackageCmd = command => {
	if (PACKAGE_TOOL === 'pnpm') return ['pnpm', [command]]
	if (PACKAGE_TOOL === 'npm') return ['npm', command === 'install' ? ['install'] : ['run', command]]
	if (PACKAGE_TOOL === 'yarn') return ['yarn', [command]]
	console.warn('未知的包管理器:', PACKAGE_TOOL)
	return ['pnpm', [command]]
}

// 安装更新工作区依赖
const [installCmd, installArgs] = getPackageCmd('install')
const installRes = spawnSync(installCmd, installArgs, {
	stdio: 'inherit',
	shell: true,
	cwd: ROOT_DIR
})
if (installRes.status !== 0) {
	console.error('\n项目依赖安装更新失败！\n')
	process.exit(1)
}

if (!isProd) {
	// 开发环境下启动前端
	const [devCmd, devArgs] = getPackageCmd('start')
	const frontend = spawn(devCmd, devArgs, {
		stdio: 'inherit',
		shell: true,
		cwd: FRONTEND_DIR,
		env: {
			...process.env,
			NODE_ENV: 'development',
			PORT: Number(process.env.FRONTEND_PORT || '3000')
		}
	})
	// 启动后端
	const server = spawn(process.execPath, ['--watch', SERVER_ENTRY], {
		stdio: 'inherit',
		cwd: ROOT_DIR,
		env: {
			...process.env,
			NODE_ENV: 'development'
		}
	})
	const killAll = () => {
		if (process.platform === 'win32') {
			if (server?.pid) exec(`taskkill /F /T /PID ${server.pid}`)
			if (frontend?.pid) exec(`taskkill /F /T /PID ${frontend.pid}`)
			process.exit(0)
		} else {
			server?.kill()
			frontend?.kill()
			setTimeout(() => process.exit(0), 1500)
		}
	}
	process.on('SIGINT', killAll)
	process.on('SIGTERM', killAll)
} else {
	// 生产环境依赖构建文件
	const [prodCmd, prodArgs] = getPackageCmd('build')
	const buildRes = spawnSync(prodCmd, prodArgs, {
		stdio: 'inherit',
		shell: true,
		cwd: FRONTEND_DIR,
		env: {
			...process.env,
			NODE_ENV: 'production'
		}
	})
	if (buildRes.status !== 0) {
		console.error('\n前端构建失败！已停止启动服务。\n')
		process.exit(1)
	}
	// 启动 PM2 进程托管后端
	const { default: pm2 } = await import('pm2')
	pm2.connect(err => {
		if (err) {
			console.error('PM2 连接失败:', err)
			process.exit(1)
		}
		fs.mkdirSync(LOGS_DIR, { recursive: true })
		pm2.start(
			{
				script: SERVER_ENTRY,
				cwd: ROOT_DIR,
				name: 'hearth-radio',
				env: {
					...process.env,
					NODE_ENV: 'production'
				},
				output: path.join(LOGS_DIR, 'out.log'),
				error: path.join(LOGS_DIR, 'error.log'),
				merge_logs: true
			},
			(err, _proc) => {
				if (err) console.error('PM2 进程启动失败:', err)
				else {
					console.log('\nPM2 进程启动成功！\n')
					spawnSync('pm2', ['list'], {
						stdio: 'inherit',
						shell: true
					})
				}
				pm2.disconnect()
				process.exit(err ? 1 : 0)
			}
		)
	})
}
