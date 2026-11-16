import type { FastifyInstance } from 'fastify'
import { getRadioOptions, updateRadioOption, type RadioOptions } from '../services/radio/options.js'

export default async function radioOptionsRoutes(fastify: FastifyInstance) {
	fastify.get('/radio-options', () => ({ code: 200, data: getRadioOptions() }))

	fastify.patch<{ Body: { key: keyof RadioOptions; enabled: boolean } }>(
		'/radio-options',
		{
			schema: {
				body: {
					type: 'object',
					additionalProperties: false,
					required: ['key', 'enabled'],
					properties: {
						key: { type: 'string', enum: ['guestRoamingEnabled', 'emojiChatEnabled'] },
						enabled: { type: 'boolean' }
					}
				}
			}
		},
		async request => ({ code: 200, data: await updateRadioOption(request.body.key, request.body.enabled) })
	)
}
