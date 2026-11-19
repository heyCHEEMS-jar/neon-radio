import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const version = 1
const nonceLength = 12
const authTagLength = 16
const headerLength = 1 + nonceLength + authTagLength

function createAad(uid: string) {
	return Buffer.concat([Buffer.from('neon-radio\0netease-session\0', 'utf8'), Buffer.from([version]), Buffer.from(`\0${uid}`, 'utf8')])
}

function validateKey(key: Buffer) {
	if (key.length !== 32) throw new Error('网易云 Cookie 加密密钥无效')
}

// 解析 .env 中的 Base64 密钥，格式错误直接在启动时失败
export function decodeKey(value: string) {
	if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new Error('NETEASE_COOKIE_ENCRYPTION_KEY 必须是标准 Base64 编码的 32 字节密钥')
	const key = Buffer.from(value, 'base64')
	if (key.length !== 32 || key.toString('base64') !== value) throw new Error('NETEASE_COOKIE_ENCRYPTION_KEY 必须是标准 Base64 编码的 32 字节密钥')
	return key
}

// 密文格式保持 version + nonce + authTag + ciphertext，已有部署无需重新登录
export function encryptCookie(cookie: string, uid: string, key: Buffer) {
	validateKey(key)
	const nonce = randomBytes(nonceLength)
	const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength })
	cipher.setAAD(createAad(uid))
	const ciphertext = Buffer.concat([cipher.update(cookie, 'utf8'), cipher.final()])
	return Buffer.concat([Buffer.from([version]), nonce, cipher.getAuthTag(), ciphertext])
}

export function decryptCookie(envelope: Buffer, uid: string, key: Buffer) {
	validateKey(key)
	if (envelope.length < headerLength) throw new Error('网易云登录态密文格式无效')
	if (envelope[0] !== version) throw new Error('网易云登录态密文版本不受支持')

	const nonce = envelope.subarray(1, 1 + nonceLength)
	const authTag = envelope.subarray(1 + nonceLength, headerLength)
	const ciphertext = envelope.subarray(headerLength)
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength })
		decipher.setAAD(createAad(uid))
		decipher.setAuthTag(authTag)
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
	} catch {
		throw new Error('网易云登录态解密失败，密钥或密文无效')
	}
}
