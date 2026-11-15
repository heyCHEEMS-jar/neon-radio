import mysql from 'mysql2/promise'
import config from '../config.js'

const connectionOptions = {
	host: config.DB_HOST,
	port: config.DB_PORT,
	user: config.DB_USER,
	password: config.DB_PASSWORD,
	timezone: 'Z'
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

export async function ensureDatabase() {
	const connection = await mysql.createConnection(connectionOptions)
	try {
		await connection.query(
			`CREATE DATABASE IF NOT EXISTS ${connection.escapeId(config.DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
		)
	} finally {
		await connection.end()
	}
}

let closePromise: Promise<void> | null = null

export function closeDatabase() {
	closePromise ??= pool.end()
	return closePromise
}
