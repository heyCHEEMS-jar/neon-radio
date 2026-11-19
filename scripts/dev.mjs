import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

// 脚本位于 scripts/，项目根目录在上一级
const ROOT_DIR = path.join(import.meta.dirname, '..')
const envPath = path.join(ROOT_DIR, '.env')

if (!fs.existsSync(envPath)) {
	console.error('\n.env 文件不存在！请根据根目录下的 .env.example 创建 .env 并配置环境变量。\n')
	process.exit(1)
}
process.loadEnvFile(envPath)

const requestedTool = process.env.PACKAGE_TOOL || 'pnpm'
const packageTool = ['pnpm', 'npm', 'yarn'].includes(requestedTool) ? requestedTool : 'pnpm'
if (packageTool !== requestedTool) console.warn(`未知的包管理器 ${requestedTool}，已回退到 pnpm`)

// 各包管理器的目录参数和 exec 语法不同，统一从项目脚本启动子进程
const runScript = (dir, script) => {
	if (packageTool === 'npm') return `npm --prefix ${dir} run ${script}`
	if (packageTool === 'yarn') return `yarn --cwd ${dir} ${script}`
	return `pnpm --dir ${dir} ${script}`
}
const execPrefix = packageTool === 'npm' ? 'npm exec --' : packageTool === 'yarn' ? 'yarn' : 'pnpm exec'

// 前后端一起启动，任一进程退出时同时结束另一个，避免残留端口占用
const command = [
	execPrefix,
	'concurrently',
	'-k',
	'-n',
	'web,api',
	'-c',
	'cyan,magenta',
	`"${runScript('frontend', 'dev')}"`,
	`"${runScript('server', 'dev')}"`
].join(' ')

const child = spawn(command, {
	stdio: 'inherit',
	shell: true,
	cwd: ROOT_DIR,
	env: { ...process.env, NODE_ENV: 'development', PORT: process.env.WEB_PORT || '3003' }
})

child.on('exit', code => process.exit(code ?? 0))
