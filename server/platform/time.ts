// 数据库统一保存 UTC 秒精度的 DATETIME
export function formatUtcTimestamp(value: Date) {
	return value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}
