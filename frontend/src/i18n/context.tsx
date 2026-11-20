'use client'

import { formatMessage, type Locale, type ServerMessage } from '@neon-radio/protocol'
import { useEffect, useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from './index'
import { detectLocale, saveLocale, type StringKey } from './locales'

interface I18nState {
	locale: Locale
	t: (key: StringKey, params?: Record<string, string | number>) => string
	serverMessage: (message: ServerMessage) => string
	toggleLocale: () => void
}

// 首屏固定中文与服务端一致，挂载后再切到浏览器或已保存的语言
export function I18nProvider({ children }: { children: ReactNode }) {
	// 读取已保存或浏览器偏好的语言，同时同步根节点的 lang
	useEffect(() => {
		const next = detectLocale()
		void i18n.changeLanguage(next)
		document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
	}, [])

	return children
}

// 读取当前语言，并给出界面文案、服务端提示渲染和切换入口
export function useI18n(): I18nState {
	const { t } = useTranslation()
	const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'zh'

	return useMemo(
		() => ({
			locale,
			t: (key, params) => t(key, params ?? {}),
			serverMessage: (message: ServerMessage) => formatMessage(message, locale),
			toggleLocale: () => {
				const next: Locale = locale === 'zh' ? 'en' : 'zh'
				saveLocale(next)
				void i18n.changeLanguage(next)
				document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
			}
		}),
		[locale, t]
	)
}
