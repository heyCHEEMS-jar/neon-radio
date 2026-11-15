export function mergeCookies(current: string, updates: string[]) {
	const cookies = new Map<string, string>()
	for (const part of current.split(';')) {
		const index = part.indexOf('=')
		if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
	}
	for (const update of updates) {
		const part = update.split(';')[0] || ''
		const index = part.indexOf('=')
		if (index < 1) continue
		const name = part.slice(0, index).trim()
		const value = part.slice(index + 1).trim()
		if (!value || /(?:^|;)\s*Max-Age=0(?:;|$)/i.test(update)) cookies.delete(name)
		else cookies.set(name, value)
	}
	return Array.from(cookies, ([name, value]) => `${name}=${value}`).join('; ')
}
