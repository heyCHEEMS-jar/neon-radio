import { EventEmitter } from 'node:events'
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

export const radioOptionsEvents = new EventEmitter<{ change: [RadioOptions] }>()
let currentOptions: RadioOptions = { guestRoamingEnabled: false, emojiChatEnabled: false }
let pendingUpdate = Promise.resolve()

const optionColumns = {
	guestRoamingEnabled: 'guest_roaming_enabled',
	emojiChatEnabled: 'emoji_chat_enabled'
}

// 初始化数据库配置，实时连接使用最新已提交的快照
export async function initRadioOptions() {
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
		[config.NETEASE_UID]
	)
	// 未保存过的电台配置默认关闭
	const row = rows[0]
	currentOptions = { guestRoamingEnabled: Boolean(row?.guestRoamingEnabled), emojiChatEnabled: Boolean(row?.emojiChatEnabled) }
}

export function getRadioOptions(): RadioOptions {
	return { ...currentOptions }
}

// 串行保存指定开关，提交成功后再广播，避免多浏览器更新乱序
export function updateRadioOption(key: keyof RadioOptions, enabled: boolean): Promise<RadioOptions> {
	const next = pendingUpdate.then(async () => {
		const column = optionColumns[key]
		const value = enabled ? 1 : 0
		await pool.execute(
			`INSERT INTO radio_options (netease_uid, ${column}) VALUES (?, ?)
			ON DUPLICATE KEY UPDATE ${column} = ?`,
			[config.NETEASE_UID, value, value]
		)
		currentOptions = { ...currentOptions, [key]: enabled }
		const options = getRadioOptions()
		radioOptionsEvents.emit('change', options)
		return options
	})
	pendingUpdate = next.then(
		() => {},
		() => {}
	)
	return next
}
