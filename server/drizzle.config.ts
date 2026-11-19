import { defineConfig } from 'drizzle-kit'

// 只用于生成迁移 SQL，运行时不连接数据库
export default defineConfig({
	schema: './platform/schema.ts',
	out: './drizzle',
	dialect: 'mysql'
})
