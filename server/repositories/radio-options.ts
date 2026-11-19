import type { RowDataPacket } from 'mysql2/promise'
import { pool } from '../utils/db.js'

export type PlaybackOrder = 'random' | 'sequential' | 'single'

export interface RadioOptions {
	guestRoamingEnabled: boolean
	emojiChatEnabled: boolean
	forceMainPlaybackSyncEnabled: boolean
	playbackOrder: PlaybackOrder
}

interface RadioOptionsRow extends RowDataPacket {
	guestRoamingEnabled: number
	emojiChatEnabled: number
	forceMainPlaybackSyncEnabled: number
	playbackOrder: PlaybackOrder
}

const optionColumns = {
	guestRoamingEnabled: 'guest_roaming_enabled',
	emojiChatEnabled: 'emoji_chat_enabled',
	forceMainPlaybackSyncEnabled: 'force_main_playback_sync_enabled',
	playbackOrder: 'playback_order'
}

// 为已有配置表补充字段，保留原开关值，播放顺序默认随机
async function ensureOptionColumns() {
	const [rows] = await pool.execute<RowDataPacket[]>(
		`SELECT COLUMN_NAME FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'radio_options'`
	)
	if (!rows.some(row => row.COLUMN_NAME === 'force_main_playback_sync_enabled')) {
		await pool.query('ALTER TABLE radio_options ADD COLUMN force_main_playback_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE')
	}
	if (!rows.some(row => row.COLUMN_NAME === 'playback_order')) {
		await pool.query("ALTER TABLE radio_options ADD COLUMN playback_order ENUM('random', 'sequential', 'single') NOT NULL DEFAULT 'random'")
	}
}

// 初始化配置表并读取固定电台的设置
export async function initRadioOptionsRepository(uid: string): Promise<RadioOptions> {
	await pool.query(`
		CREATE TABLE IF NOT EXISTS radio_options (
			netease_uid VARCHAR(20) NOT NULL PRIMARY KEY,
			guest_roaming_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			emoji_chat_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			force_main_playback_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,
			playback_order ENUM('random', 'sequential', 'single') NOT NULL DEFAULT 'random'
		) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
	`)
	await ensureOptionColumns()
	const [rows] = await pool.execute<RadioOptionsRow[]>(
		`SELECT guest_roaming_enabled AS guestRoamingEnabled,
			emoji_chat_enabled AS emojiChatEnabled,
			force_main_playback_sync_enabled AS forceMainPlaybackSyncEnabled,
			playback_order AS playbackOrder
		FROM radio_options WHERE netease_uid = ? LIMIT 1`,
		[uid]
	)
	const row = rows[0] // 未保存过时开关关闭，播放顺序随机
	return {
		guestRoamingEnabled: Boolean(row?.guestRoamingEnabled),
		emojiChatEnabled: Boolean(row?.emojiChatEnabled),
		forceMainPlaybackSyncEnabled: Boolean(row?.forceMainPlaybackSyncEnabled),
		playbackOrder: row?.playbackOrder ?? 'random'
	}
}

// 单项保存同时支持布尔开关和播放顺序，列名只取固定映射
export async function saveRadioOption<K extends keyof RadioOptions>(uid: string, key: K, value: RadioOptions[K]) {
	const column = optionColumns[key]
	const stored = typeof value === 'boolean' ? Number(value) : value
	await pool.execute(
		`INSERT INTO radio_options (netease_uid, ${column}) VALUES (?, ?)
		ON DUPLICATE KEY UPDATE ${column} = ?`,
		[uid, stored, stored]
	)
}
