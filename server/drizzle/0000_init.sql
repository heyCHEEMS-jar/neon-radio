CREATE TABLE IF NOT EXISTS `browser_sessions` (
	`token_hash` binary(32) NOT NULL,
	`netease_uid` varchar(20) NOT NULL,
	`expires_at` datetime NOT NULL,
	CONSTRAINT `browser_sessions_token_hash` PRIMARY KEY(`token_hash`),
	INDEX `browser_sessions_uid` (`netease_uid`),
	INDEX `browser_sessions_expires` (`expires_at`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `netease_sessions` (
	`netease_uid` varchar(20) NOT NULL,
	`cookie_envelope` mediumblob NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `netease_sessions_netease_uid` PRIMARY KEY(`netease_uid`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radio_options` (
	`netease_uid` varchar(20) NOT NULL,
	`guest_roaming_enabled` boolean NOT NULL DEFAULT false,
	`force_main_playback_sync_enabled` boolean NOT NULL DEFAULT false,
	`playback_order` enum('random','sequential','single') NOT NULL DEFAULT 'random',
	CONSTRAINT `radio_options_netease_uid` PRIMARY KEY(`netease_uid`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roaming_songs` (
	`netease_uid` varchar(20) NOT NULL,
	`song_key` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`sort_order` int unsigned NOT NULL,
	`song` json NOT NULL,
	`synced_at` datetime NOT NULL,
	CONSTRAINT `roaming_songs_netease_uid_song_key_pk` PRIMARY KEY(`netease_uid`,`song_key`),
	INDEX `roaming_songs_order` (`netease_uid`,`sort_order`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `roaming_song_impacts` (
	`netease_uid` varchar(20) NOT NULL,
	`song_id` varchar(20) NOT NULL,
	`analysis_version` smallint unsigned NOT NULL DEFAULT 0,
	`duration_ms` int unsigned NOT NULL,
	`impacts` json NOT NULL,
	`analyzed_at` datetime NOT NULL,
	CONSTRAINT `roaming_song_impacts_netease_uid_song_id_pk` PRIMARY KEY(`netease_uid`,`song_id`)
);
