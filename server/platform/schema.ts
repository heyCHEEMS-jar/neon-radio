import { customType, datetime, index, int, json, mysqlEnum, mysqlTable, primaryKey, smallint, boolean, varchar } from 'drizzle-orm/mysql-core'
import type { AudioImpact, LyricLine } from '@neon-radio/protocol'

// BINARY/MEDIUMBLOB 需要保留原始 Buffer，drizzle 内置 binary 会转成字符串
const binaryHash = customType<{ data: Buffer }>({ dataType: () => 'binary(32)' })
const mediumBlob = customType<{ data: Buffer }>({ dataType: () => 'mediumblob' })
const songKey = customType<{ data: string }>({ dataType: () => 'char(64) CHARACTER SET ascii COLLATE ascii_bin' })

export const neteaseSessions = mysqlTable('netease_sessions', {
	neteaseUid: varchar('netease_uid', { length: 20 }).primaryKey(),
	cookieEnvelope: mediumBlob('cookie_envelope').notNull(),
	updatedAt: datetime('updated_at').notNull()
})

export const browserSessions = mysqlTable(
	'browser_sessions',
	{
		tokenHash: binaryHash('token_hash').primaryKey(),
		neteaseUid: varchar('netease_uid', { length: 20 }).notNull(),
		expiresAt: datetime('expires_at').notNull()
	},
	table => [index('browser_sessions_uid').on(table.neteaseUid), index('browser_sessions_expires').on(table.expiresAt)]
)

export const roamingSongs = mysqlTable(
	'roaming_songs',
	{
		neteaseUid: varchar('netease_uid', { length: 20 }).notNull(),
		songKey: songKey('song_key').notNull(),
		sortOrder: int('sort_order', { unsigned: true }).notNull(),
		song: json('song').$type<Record<string, unknown>>().notNull(),
		syncedAt: datetime('synced_at').notNull()
	},
	table => [primaryKey({ columns: [table.neteaseUid, table.songKey] }), index('roaming_songs_order').on(table.neteaseUid, table.sortOrder)]
)

export const radioOptions = mysqlTable('radio_options', {
	neteaseUid: varchar('netease_uid', { length: 20 }).primaryKey(),
	guestRoamingEnabled: boolean('guest_roaming_enabled').notNull().default(false),
	forceMainPlaybackSyncEnabled: boolean('force_main_playback_sync_enabled').notNull().default(false),
	playbackOrder: mysqlEnum('playback_order', ['random', 'sequential', 'single']).notNull().default('random')
})

export const songImpacts = mysqlTable(
	'roaming_song_impacts',
	{
		neteaseUid: varchar('netease_uid', { length: 20 }).notNull(),
		songId: varchar('song_id', { length: 20 }).notNull(),
		analysisVersion: smallint('analysis_version', { unsigned: true }).notNull().default(0),
		durationMs: int('duration_ms', { unsigned: true }).notNull(),
		impacts: json('impacts').$type<AudioImpact[]>().notNull(),
		analyzedAt: datetime('analyzed_at').notNull()
	},
	table => [primaryKey({ columns: [table.neteaseUid, table.songId] })]
)

export const songChorus = mysqlTable(
	'roaming_song_chorus',
	{
		neteaseUid: varchar('netease_uid', { length: 20 }).notNull(),
		songId: varchar('song_id', { length: 20 }).notNull(),
		startMs: int('start_ms', { unsigned: true }),
		endMs: int('end_ms', { unsigned: true }),
		fetchedAt: datetime('fetched_at').notNull()
	},
	table => [primaryKey({ columns: [table.neteaseUid, table.songId] })]
)

export const songLyric = mysqlTable(
	'roaming_song_lyric',
	{
		neteaseUid: varchar('netease_uid', { length: 20 }).notNull(),
		songId: varchar('song_id', { length: 20 }).notNull(),
		lines: json('lines').$type<LyricLine[]>().notNull(),
		fetchedAt: datetime('fetched_at').notNull()
	},
	table => [primaryKey({ columns: [table.neteaseUid, table.songId] })]
)
