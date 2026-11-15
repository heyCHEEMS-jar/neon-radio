import type { RowDataPacket } from 'mysql2/promise'
import config from '../config.js'
import { pool } from '../utils/db.js'

export interface RadioOptions {
	guestRoamingEnabled: boolean
	emojiChatEnabled: boolean
}

interface RadioOptionsRow extends RowDataPacket {
	guestRoamingEnabled: number
	emojiChatEnabled: number
}

const optionColumns = {
	guestRoamingEnabled: 'guest_roaming_enabled',
	emojiChatEnabled: 'emoji_chat_enabled'
}

// 在登录存储初始化后创建电台配置表
export async function initRadioOptions() {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS radio_options (
			netease_uid VARCHAR(20) NOT NULL PRIMARY KEY,
			guest_roaming_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			emoji_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
}

// 未保存过的电台配置默认关闭
export async function getRadioOptions(): Promise<RadioOptions> {
	const [rows] = await pool.execute<RadioOptionsRow[]>(
		`SELECT guest_roaming_enabled AS guestRoamingEnabled, emoji_chat_enabled AS emojiChatEnabled
		FROM radio_options WHERE netease_uid = ? LIMIT 1`,
		[config.NETEASE_UID]
	)
	const row = rows[0]
	return { guestRoamingEnabled: Boolean(row?.guestRoamingEnabled), emojiChatEnabled: Boolean(row?.emojiChatEnabled) }
}

// 只更新指定开关，避免旧页面覆盖另一项配置
export async function updateRadioOption(key: keyof RadioOptions, enabled: boolean): Promise<RadioOptions> {
	const column = optionColumns[key]
	const value = enabled ? 1 : 0
	await pool.execute(
		`INSERT INTO radio_options (netease_uid, ${column}) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE ${column} = ?`,
		[config.NETEASE_UID, value, value]
	)
	return getRadioOptions()
}
