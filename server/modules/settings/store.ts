import type { PlaybackOrder, RadioOptions } from '@neon-radio/protocol'
import { eq } from 'drizzle-orm'
import { db } from '../../platform/db.js'
import { radioOptions } from '../../platform/schema.js'

// 未保存过时开关关闭，播放顺序随机
export async function readOptionsRow(uid: string): Promise<RadioOptions> {
	const [row] = await db.select().from(radioOptions).where(eq(radioOptions.neteaseUid, uid)).limit(1)
	return {
		guestRoamingEnabled: Boolean(row?.guestRoamingEnabled),
		forceMainPlaybackSyncEnabled: Boolean(row?.forceMainPlaybackSyncEnabled),
		playbackOrder: row?.playbackOrder ?? 'random'
	}
}

// 单项保存只更新对应列，避免覆盖其他开关
export async function saveFlagRow(uid: string, key: 'guestRoamingEnabled' | 'forceMainPlaybackSyncEnabled', value: boolean) {
	if (key === 'guestRoamingEnabled') {
		await db.insert(radioOptions).values({ neteaseUid: uid, guestRoamingEnabled: value }).onDuplicateKeyUpdate({ set: { guestRoamingEnabled: value } })
		return
	}
	await db
		.insert(radioOptions)
		.values({ neteaseUid: uid, forceMainPlaybackSyncEnabled: value })
		.onDuplicateKeyUpdate({ set: { forceMainPlaybackSyncEnabled: value } })
}

export async function savePlaybackOrderRow(uid: string, order: PlaybackOrder) {
	await db.insert(radioOptions).values({ neteaseUid: uid, playbackOrder: order }).onDuplicateKeyUpdate({ set: { playbackOrder: order } })
}
