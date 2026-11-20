'use client'

import { Languages } from 'lucide-react'
import { useI18n } from '@/i18n/context'

// 右上角语言切换
export default function LocaleToggle({ className }: { className?: string }) {
	const { locale, t, toggleLocale } = useI18n()

	return (
		<button
			type="button"
			onClick={toggleLocale}
			aria-label={t('lang.switch')}
			title={t('lang.switch')}
			className={`flex cursor-pointer items-center gap-1.5 p-1 text-xs font-medium tabular-nums text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.8)] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-white ${className ?? ''}`}
		>
			<Languages className="size-3.5" aria-hidden="true" />
			{locale === 'zh' ? '中' : 'EN'}
		</button>
	)
}
