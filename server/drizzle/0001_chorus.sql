CREATE TABLE `roaming_song_chorus` (
	`netease_uid` varchar(20) NOT NULL,
	`song_id` varchar(20) NOT NULL,
	`start_ms` int unsigned,
	`end_ms` int unsigned,
	`fetched_at` datetime NOT NULL,
	CONSTRAINT `roaming_song_chorus_netease_uid_song_id_pk` PRIMARY KEY(`netease_uid`,`song_id`)
);
