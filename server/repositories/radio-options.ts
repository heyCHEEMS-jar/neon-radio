import type { RowDataPacket } from 'mysql2/promise'
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

export async function initRadioOptionsRepository(uid: string): Promise<RadioOptions> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS radio_options (
			netease_uid VARCHAR(20) NOT NULL PRIMARY KEY,
			guest_roaming_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			emoji_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	const [rows] = await pool.execute<RadioOptionsRow[]>(
		`SELECT guest_roaming_enabled AS guestRoamingEnabled, emoji_chat_enabled AS emojiChatEnabled
		FROM radio_options WHERE netease_uid = ? LIMIT 1`,
		[uid]
	)
	// 未保存过的电台配置默认关闭
	const row = rows[0]
	return { guestRoamingEnabled: Boolean(row?.guestRoamingEnabled), emojiChatEnabled: Boolean(row?.emojiChatEnabled) }
}

export async function saveRadioOption(uid: string, key: keyof RadioOptions, enabled: boolean) {
	const column = optionColumns[key]
	const value = enabled ? 1 : 0
	await pool.execute(
		`INSERT INTO radio_options (netease_uid, ${column}) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE ${column} = ?`,
		[uid, value, value]
	)
}
