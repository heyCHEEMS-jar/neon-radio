import type { Locale } from '@neon-radio/protocol'

// 界面文案：每条同时保存中英文，初始化时按语言摊平给 i18next
export const strings = {
	'common.cancel': { zh: '取消', en: 'Cancel' },
	'common.close': { zh: '关闭', en: 'Close' },
	'common.retry': { zh: '重新加载', en: 'Reload' },

	'lang.switch': { zh: '切换到英文', en: 'Switch to Chinese' },

	'menu.checking': { zh: '检查登录状态…', en: 'Checking sign-in…' },
	'menu.logout': { zh: '退出登录', en: 'Sign out' },
	'menu.login': { zh: '登录电台', en: 'Sign in' },
	'menu.check': { zh: '检查登录状态', en: 'Check sign-in' },
	'menu.toMain': { zh: '回主电台', en: 'Back to main radio' },
	'menu.roaming': { zh: '漫游所有歌曲', en: 'Browse all songs' },
	'menu.motionOff': { zh: '关闭屏幕晃动', en: 'Turn off screen motion' },
	'menu.motionOn': { zh: '开启屏幕晃动', en: 'Turn on screen motion' },
	'menu.options': { zh: '电台选项', en: 'Radio options' },
	'menu.loginFailed': { zh: '登录状态检查失败，请重试', en: 'Could not check the sign-in state. Try again.' },
	'menu.loginSuccess': { zh: '登录成功', en: 'Signed in' },
	'menu.logoutSuccess': { zh: '退出登录成功', en: 'Signed out' },
	'menu.motionSaveFailed': { zh: '无法保存屏幕晃动偏好', en: 'Could not save the screen motion preference' },
	'menu.outsideLive': { zh: '电台菜单需要放在电台实时管线内', en: 'The radio menu must be mounted inside the live radio pipeline' },

	'login.title': { zh: '登录电台', en: 'Sign in to the radio' },
	'login.logoutTitle': { zh: '退出登录', en: 'Sign out' },
	'login.logoutDescription': {
		zh: '确定要退出登录吗？退出后需要重新扫码登录电台。',
		en: 'Sign out of the radio? You will need to scan the QR code again to sign back in.'
	},
	'login.loggingOut': { zh: '正在退出…', en: 'Signing out…' },
	'login.confirmLogout': { zh: '确认退出', en: 'Sign out' },
	'login.logoutFailed': { zh: '退出登录失败，请重试', en: 'Could not sign out. Try again.' },

	'qr.generating': { zh: '正在生成二维码…', en: 'Generating the QR code…' },
	'qr.generateFailed': { zh: '登录请求失败', en: 'The sign-in request failed' },
	'qr.fallbackScan': {
		zh: '请用网易云音乐 App 扫码，并在手机上确认。',
		en: 'Scan with the NetEase Cloud Music app and confirm on your phone.'
	},
	'qr.imageAlt': { zh: '网易云音乐登录二维码', en: 'NetEase Cloud Music sign-in QR code' },
	'qr.refresh': { zh: '刷新二维码', en: 'Refresh QR code' },
	'qr.busy': { zh: '生成中…', en: 'Generating…' },

	'listeners.online': { zh: '在线', en: 'Online' },
	'listeners.empty': { zh: '暂时没有人在听', en: 'Nobody is listening right now' },
	'listeners.hintHover': {
		zh: '人在线，悬停查看每首歌的在听人数',
		en: 'listeners online. Hover to see listeners per song.'
	},
	'listeners.hintTap': {
		zh: '人在线，点击查看每首歌的在听人数',
		en: 'listeners online. Tap to see listeners per song.'
	},

	'roaming.loadFailed': { zh: '漫游加载失败，请刷新并重试', en: 'Could not load browsing. Refresh and try again.' },
	'roaming.title': { zh: '漫游所有歌曲', en: 'Browse all songs' },
	'roaming.description': {
		zh: '搜索歌名或歌手，点击封面切换播放，Esc 退出',
		en: 'Search by song or artist, click a cover to play it, press Esc to leave'
	},
	'roaming.searchPlaceholder': { zh: '搜索歌名或歌手', en: 'Search songs or artists' },
	'roaming.searchLabel': { zh: '搜索漫游歌曲', en: 'Search songs to browse' },
	'roaming.noMatch': { zh: '没有匹配的歌曲', en: 'No matching songs' },
	'roaming.loadFailedRetry': { zh: '歌曲列表连接失败，点击重试', en: 'Could not load the song list. Click to retry.' },
	'roaming.loading': { zh: '正在加载歌曲列表…', en: 'Loading songs…' },
	'roaming.empty': { zh: '暂无歌曲，等待电台同步', en: 'No songs yet. Waiting for the radio to sync.' },
	'roaming.close': { zh: '关闭漫游', en: 'Close browsing' },
	'roaming.outsideLive': { zh: '漫游需要放在电台实时管线内', en: 'Browsing must be mounted inside the live radio pipeline' },

	'cover.preparing': { zh: '正在准备封面', en: 'Preparing covers' },
	'cover.loading': { zh: '正在加载封面', en: 'Loading cover' },
	'cover.missing': { zh: '暂无封面', en: 'No cover' },
	'cover.play': { zh: '播放歌曲', en: 'Play song' },
	'cover.playing': { zh: '播放中', en: 'Playing' },

	'options.title': { zh: '电台选项', en: 'Radio options' },
	'options.loading': { zh: '正在读取电台配置…', en: 'Loading radio settings…' },
	'options.ready': { zh: '配置已与服务端同步。', en: 'Settings are in sync with the server.' },
	'options.saving': { zh: '正在保存电台配置…', en: 'Saving radio settings…' },
	'options.loadError': { zh: '配置读取失败，请重试。', en: 'Could not load the settings. Try again.' },
	'options.orderLabel': { zh: '播放顺序', en: 'Playback order' },
	'options.orderHint': { zh: '切歌时生效，主线和本地漫游分别播放。', en: 'Applies when the song changes. Main and local roaming play separately.' },
	'options.guestRoaming': { zh: '游客自漫游', en: 'Guest roaming' },
	'options.guestRoamingHint': {
		zh: '自行选歌、调整进度，不影响主线电台。',
		en: 'Guests pick songs and adjust progress without affecting the main radio.'
	},
	'options.forceSync': { zh: '强制同步到主电台', en: 'Force sync to the main radio' },
	'options.forceSyncHint': {
		zh: '开启时推送当前歌曲和进度，管理员选歌会影响主线听众，游客漫游不受影响。',
		en: 'Pushes the current song and progress. Admin picks affect main-listeners; guest roaming is unaffected.'
	},
	'options.confirmSyncTitle': { zh: '开启主线同步', en: 'Enable main-line sync' },
	'options.confirmSyncDescription': {
		zh: '开启后，本页面当前歌曲和播放进度会立即推送到主电台，主线听众将同步切换；之后所有已登录管理员页面的选歌操作都会影响主电台，游客漫游仍独立播放。确定开启吗？',
		en: 'The current song and progress on this page will be pushed to the main radio immediately and main-listeners will switch with it. After that, song picks on any signed-in admin page affect the main radio; guest roaming keeps playing independently. Enable it?'
	},
	'options.confirmEnable': { zh: '确认开启', en: 'Enable' },
	'options.syncing': { zh: '正在同步…', en: 'Syncing…' },
	'options.resync': { zh: '重新同步网易云数据', en: 'Resync NetEase Cloud Music data' },
	'options.syncSending': { zh: '正在发送同步请求…', en: 'Sending the sync request…' },
	'options.syncPending': { zh: '正在同步网易云数据', en: 'Syncing NetEase Cloud Music data' },
	'options.outsideLive': { zh: '电台选项需要放在电台实时管线内', en: 'Radio options must be mounted inside the live radio pipeline' },
	'options.saveFailed': { zh: '保存电台选项失败', en: 'Could not save the radio options' },
	'options.tryLater': { zh: '请稍后重试', en: 'Try again later' },

	'playback.single': { zh: '单曲循环', en: 'Repeat one' },
	'playback.random': { zh: '随机播放', en: 'Shuffle' },
	'playback.sequential': { zh: '顺序播放', en: 'Play in order' },
	'player.previous': { zh: '上一首', en: 'Previous song' },
	'player.next': { zh: '下一首', en: 'Next song' },
	'player.play': { zh: '播放', en: 'Play' },
	'player.pause': { zh: '暂停', en: 'Pause' },
	'player.progress': { zh: '播放进度', en: 'Playback progress' },
	'player.modeAdmin': {
		zh: '本地播放偏好仅用于游客自漫游，不影响管理员播放',
		en: 'The local playback preference only applies to guest roaming, not to admin playback'
	},
	'player.modeTitle': {
		zh: '{mode} · 仅对游客本地漫游生效，主电台不受影响',
		en: '{mode} · only applies to local guest roaming; the main radio is unaffected'
	},
	'player.modeAria': {
		zh: '游客本地播放模式：{mode}，点击切换为{next}',
		en: 'Local guest playback mode: {mode}. Click to switch to {next}.'
	},
	'player.modeBeforeStart': { zh: '请先点击播放，再切换本地播放模式', en: 'Press play first, then switch the local playback mode' },
	'player.outsideAudio': { zh: '播放器需要放在电台音频管线内', en: 'The player must be mounted inside the radio audio pipeline' },

	'visuals.label': { zh: '音频可视化', en: 'Audio visualization' },
	'visuals.waiting': { zh: '等待电台', en: 'Waiting for the radio' },
	'visuals.progress': { zh: '播放进度 {progress}', en: 'Playback progress {progress}' },

	'live.prefSaveFailed': { zh: '无法保存本地播放偏好', en: 'Could not save the local playback preference' },
	'live.prefSaveFailedDetail': {
		zh: '当前页面仍生效，刷新后将恢复单曲循环。',
		en: 'It still applies on this page; reloading restores repeat-one.'
	},
	'live.requestUnconfirmed': { zh: '播放请求未确认', en: 'Playback request not confirmed' },
	'live.requestUnconfirmedDetail': {
		zh: '保持原来的播放状态，重连后可再次尝试。',
		en: 'Keeping the previous playback state. Try again after reconnecting.'
	},
	'live.requestSendFailed': { zh: '播放请求发送失败，请重连后重试', en: 'Could not send the playback request. Reconnect and retry.' },
	'live.syncRunning': { zh: '正在同步网易云数据', en: 'Syncing NetEase Cloud Music data' },
	'live.syncSuccess': { zh: '网易云数据同步完成', en: 'NetEase Cloud Music data synced' },
	'live.syncFailed': { zh: '网易云数据同步失败', en: 'NetEase Cloud Music sync failed' },
	'live.restoreFailed': { zh: '未能恢复本地播放，已回到电台', en: 'Could not restore local playback; back on the radio' },
	'live.pickAgain': { zh: '请重新选择歌曲', en: 'Pick a song again' },
	'live.changeFailed': { zh: '切换播放失败', en: 'Could not change the song' },
	'live.tryLater': { zh: '请稍后重试', en: 'Try again later' },
	'live.syncStartFailed': { zh: '启动网易云同步失败', en: 'Could not start the NetEase Cloud Music sync' },
	'live.authExpired': { zh: '登录已失效', en: 'Your session expired' },
	'live.disconnected': { zh: '连接已断开，请稍后重试', en: 'Disconnected. Try again later.' },
	'live.pendingBeforeSync': {
		zh: '请等待当前播放操作完成后再开启主线同步',
		en: 'Wait for the current playback request to finish before enabling main-line sync'
	},
	'live.syncUnconfirmed': { zh: '同步请求未确认', en: 'Sync request not confirmed' },
	'live.syncUnconfirmedDetail': {
		zh: '任务可能已经启动，重连后将恢复状态，请勿重复点击。',
		en: 'The task may already be running. Its state returns after reconnecting, so do not click again.'
	},
	'live.syncSendFailed': { zh: '同步请求发送失败，请重连后重试', en: 'Could not send the sync request. Reconnect and retry.' },
	'live.playbackInterrupted': { zh: '播放请求连接中断', en: 'Playback request interrupted' },
	'live.playbackInterruptedDetail': {
		zh: '未确认的请求请重连后重试，已受理的主线操作不受页面断线影响。',
		en: 'Retry unconfirmed requests after reconnecting. Accepted main-line changes are unaffected by this disconnect.'
	},
	'live.syncInterrupted': { zh: '同步请求连接中断', en: 'Sync request interrupted' },
	'live.syncInterruptedDetail': {
		zh: '任务可能仍在后台运行，重连后将恢复状态，请勿重复点击。',
		en: 'The task may still be running in the background. Its state returns after reconnecting, so do not click again.'
	}
} as const

export type StringKey = keyof typeof strings

// 按 key 摊平当前语言的文案，i18next 用 keySeparator: false 直接查表
function pick(locale: Locale) {
	return Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[locale]]))
}

export const resources = {
	zh: { translation: pick('zh') },
	en: { translation: pick('en') }
}

export const localeStorageKey = 'locale'

// 保存的选择优先，其次是浏览器语言
export function detectLocale(): Locale {
	try {
		const stored = localStorage.getItem(localeStorageKey)
		if (stored === 'zh' || stored === 'en') return stored
	} catch {
		// 浏览器禁用存储时按语言判断
	}
	return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// 保存用户手动选择的语言
export function saveLocale(locale: Locale) {
	try {
		localStorage.setItem(localeStorageKey, locale)
	} catch {
		// 存储不可用时只影响下次打开
	}
}
