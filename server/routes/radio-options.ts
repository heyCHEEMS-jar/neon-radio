import type { FastifyInstance } from 'fastify'
import type { PlaybackOrder } from '@neon-radio/protocol'
import { getRadioOptions, updateRadioOption } from '../modules/settings/index.js'

type OptionUpdate = { key: 'playbackOrder'; value: PlaybackOrder } | { key: 'guestRoamingEnabled' | 'forceMainPlaybackSyncEnabled'; value: boolean }

// 开关和播放顺序都单项保存，服务器校验选项与值的对应关系
export default async function radioOptionsRoutes(fastify: FastifyInstance) {
	fastify.get('/radio-options', () => ({ code: 200, data: getRadioOptions() }))
	fastify.patch<{ Body: OptionUpdate }>(
		'/radio-options',
		{
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['key', 'value'],
					properties: { key: { type: 'string' }, value: {} },
					oneOf: [
						{ properties: { key: { enum: ['guestRoamingEnabled', 'forceMainPlaybackSyncEnabled'] }, value: { type: 'boolean' } } },
						{ properties: { key: { const: 'playbackOrder' }, value: { type: 'string', enum: ['random', 'sequential', 'single'] } } }
					]
				}
			}
		},
		async request => {
			const { key, value } = request.body
			const data = key === 'playbackOrder' ? await updateRadioOption('playbackOrder', value) : await updateRadioOption(key, value)
			return { code: 200, data }
		}
	)
}
