import { rmSync } from 'node:fs'
import path from 'node:path'

// 清理构建缓存和日志，不影响源码与数据库
const ROOT_DIR = path.join(import.meta.dirname, '..')
for (const target of ['frontend/.next', 'logs', 'server/dist']) {
	rmSync(path.join(ROOT_DIR, target), { recursive: true, force: true })
}
console.log('已清理构建缓存和日志')
