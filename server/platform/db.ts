import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import config from '../config.js'
import * as schema from './schema.js'

const connectionOptions = {
	host: config.DB_HOST,
	port: config.DB_PORT,
	user: config.DB_USER,
	password: config.DB_PASSWORD,
	timezone: 'Z' as const
}

export const pool = mysql.createPool({
	...connectionOptions,
	database: config.DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	maxIdle: 10,
	idleTimeout: 60_000,
	queueLimit: 0,
	enableKeepAlive: true,
	keepAliveInitialDelay: 0
})

export const db = drizzle(pool, { schema, mode: 'default' })

// 首次部署允许数据库尚不存在，连接池使用前先建库
async function ensureDatabase() {
	const connection = await mysql.createConnection(connectionOptions)
	try {
		await connection.query(`CREATE DATABASE IF NOT EXISTS ${connection.escapeId(config.DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
	} finally {
		await connection.end()
	}
}

// 启动时统一应用 drizzle 迁移，替代散落在各 repository 的建表语句
export async function initDatabase() {
	await ensureDatabase()
	await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) })
}

let closePromise: Promise<void> | null = null

export function closeDatabase() {
	closePromise ??= pool.end()
	return closePromise
}
