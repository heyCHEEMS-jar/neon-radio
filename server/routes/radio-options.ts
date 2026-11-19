import type { FastifyInstance } from 'fastify'
import { getRadioOptions, updateRadioOption, type RadioOptions } from '../services/radio/options.js'

type OptionUpdate =
	| { key: 'playbackOrder'; value: RadioOptions['playbackOrder'] }
	| { key: Exclude<keyof RadioOptions, 'playbackOrder'>; value: boolean }

// 开关和播放顺序都单项保存，服务器校验选项与值的对应关系
export default async function radioOptionsRoutes(fastify: FastifyInstance) {
	fastify.get('/radio-options', () => ({ code: 200, data: getRadioOptions() }))
	fastify.patch<{ Body: OptionUpdate }>(
		'/radio-options',
		{
			schema: {
				body: {
					type: 'object', additionalProperties: false, required: ['key', 'value'],
					properties: { key: { type: 'string' }, value: {} },
					oneOf: [
						{ properties: { key: { enum: ['guestRoamingEnabled', 'emojiChatEnabled', 'forceMainPlaybackSyncEnabled'] }, value: { type: 'boolean' } } },
						{ properties: { key: { const: 'playbackOrder' }, value: { type: 'string', enum: ['random', 'sequential', 'single'] } } }
					]
				}
			}
		},
		async request => ({ code: 200, data: await updateRadioOption(request.body.key, request.body.value) })
	)
}
