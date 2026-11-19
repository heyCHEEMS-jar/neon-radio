// 去除查询串、末尾斜杠和大小写差异，非法转义返回 null 由调用方拒绝
export function normalizeRequestPath(url: string): string | null {
	try {
		return decodeURIComponent(url.split('?')[0] || '')
			.replace(/\/+$/, '')
			.toLowerCase()
	} catch {
		return null
	}
}
