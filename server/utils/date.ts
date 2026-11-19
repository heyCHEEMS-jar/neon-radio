export function formatUtcTimestamp(value: Date) {
	return value
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d{3}Z$/, '')
}
