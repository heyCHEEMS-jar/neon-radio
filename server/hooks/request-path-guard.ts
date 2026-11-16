import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyReply, FastifyRequest } from 'fastify'

// 固定项目根目录，不受启动目录影响
const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

// 校验请求路径的项目目录边界
export default async function requestPathGuard(request: FastifyRequest, reply: FastifyReply) {
	let requestPath: string
	try {
		requestPath = decodeURIComponent(request.url.split('?')[0] || '')
	} catch {
		return reply.code(400).send({ code: 400, message: '请求路径不合法' })
	}

	const relativePath = path.relative(projectRoot, path.resolve(projectRoot, requestPath.slice(1)))
	if (!requestPath.startsWith('/') || relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
		return reply.code(403).send({ code: 403, message: '非法路径访问' })
	}
}
