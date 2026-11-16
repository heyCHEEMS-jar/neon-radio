import mysql, { type RowDataPacket } from 'mysql2/promise'
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
		await connection.query(`CREATE DATABASE IF NOT EXISTS ${connection.escapeId(config.DB_NAME)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
	} finally {
		await connection.end()
	}
}

// 只迁移仍含毫秒的旧列，新表和已迁移的列不重复执行 DDL
export async function ensureSecondPrecision(table: string, column: string) {
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT 1 FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
			AND DATA_TYPE = 'datetime' AND DATETIME_PRECISION > 0
		LIMIT 1`,
		[config.DB_NAME, table, column]
	)
	if (!rows.length) return
	await pool.query("UPDATE ?? SET ?? = DATE_FORMAT(??, '%Y-%m-%d %H:%i:%s') WHERE MICROSECOND(??) <> 0", [table, column, column, column])
	await pool.query('ALTER TABLE ?? MODIFY COLUMN ?? DATETIME NOT NULL', [table, column])
}

let closePromise: Promise<void> | null = null

export function closeDatabase() {
	closePromise ??= pool.end()
	return closePromise
}
