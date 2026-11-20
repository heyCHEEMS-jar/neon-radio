import { formatMessage, type ServerMessage } from '@neon-radio/protocol'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources, type StringKey } from './locales'

// 初始化 i18next：文案以整句为 key，资源内联，首帧即可取到译文
void i18n.use(initReactI18next).init({
	resources,
	lng: 'zh',
	fallbackLng: 'zh',
	supportedLngs: ['zh', 'en'],
	interpolation: { prefix: '{', suffix: '}', escapeValue: false },
	keySeparator: false,
	returnNull: false
})

export default i18n

// 非组件代码（hooks、回调）取文案，语言切换时不重建订阅
export function t(key: StringKey, params?: Record<string, string | number>) {
	return i18n.t(key, params ?? {})
}

// 按当前语言渲染协议里的服务端提示
export function serverMessage(message: ServerMessage) {
	return formatMessage(message, i18n.resolvedLanguage === 'en' ? 'en' : 'zh')
}
