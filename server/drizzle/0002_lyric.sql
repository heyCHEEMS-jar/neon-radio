CREATE TABLE `roaming_song_lyric` (
	`netease_uid` varchar(20) NOT NULL,
	`song_id` varchar(20) NOT NULL,
	`lines` json NOT NULL,
	`fetched_at` datetime NOT NULL,
	CONSTRAINT `roaming_song_lyric_netease_uid_song_id_pk` PRIMARY KEY(`netease_uid`,`song_id`)
);
