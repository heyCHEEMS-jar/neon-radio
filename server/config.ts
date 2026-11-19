const config = {
	API_PORT: Number(process.env.API_PORT || '4003'),
	NETEASE_UID: process.env.NETEASE_UID?.trim() || '',
	COOKIE_REFRESH_HOURS: Number(process.env.COOKIE_REFRESH_HOURS || '6'),
	USER_SESSION_DAYS: Number(process.env.USER_SESSION_DAYS || '30'),
	DB_HOST: process.env.DB_HOST?.trim() || '',
	DB_PORT: Number(process.env.DB_PORT),
	DB_USER: process.env.DB_USER?.trim() || '',
	DB_PASSWORD: process.env.DB_PASSWORD ?? '',
	DB_NAME: process.env.DB_NAME?.trim() || '',
	NETEASE_COOKIE_ENCRYPTION_KEY: process.env.NETEASE_COOKIE_ENCRYPTION_KEY ?? ''
}

function validatePort(name: string, value: number) {
	if (!Number.isInteger(value) || value < 1 || value > 65_535) throw new Error(`${name} 必须是 1 到 65535 之间的整数`)
}

export function validateConfig() {
	validatePort('API_PORT', config.API_PORT)
	if (!/^[1-9][0-9]{0,19}$/.test(config.NETEASE_UID)) throw new Error('请在 .env 配置有效的 NETEASE_UID')
	if (!Number.isFinite(config.COOKIE_REFRESH_HOURS) || config.COOKIE_REFRESH_HOURS < 1 || config.COOKIE_REFRESH_HOURS > 24) {
		throw new Error('COOKIE_REFRESH_HOURS 必须在 1 到 24 之间')
	}
	if (!Number.isInteger(config.USER_SESSION_DAYS) || config.USER_SESSION_DAYS < 1) {
		throw new Error('USER_SESSION_DAYS 必须是正整数，单位为天')
	}

	validatePort('DB_PORT', config.DB_PORT)
	if (!config.DB_HOST) throw new Error('请在 .env 配置 DB_HOST')
	if (!config.DB_USER) throw new Error('请在 .env 配置 DB_USER')
	if (!config.DB_PASSWORD) throw new Error('请在 .env 配置 DB_PASSWORD')
	if (!config.DB_NAME) throw new Error('请在 .env 配置 DB_NAME')
}

export default config
