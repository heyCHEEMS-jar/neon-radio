export function normalizeRequestPath(url: string) {
	return decodeURIComponent(url.split('?')[0] || '')
		.replace(/\/+$/, '')
		.toLowerCase()
}
