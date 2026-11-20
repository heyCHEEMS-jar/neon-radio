// 站点对外地址，构建时注入 SITE_URL；拼 sitemap 前统一补齐结尾的 /
export const siteUrl = `${(process.env.SITE_URL || `http://localhost:${process.env.WEB_PORT || 3003}`).replace(/\/+$/, '')}/`

// 站点名称与描述由 .env 注入，开源部署时各自改名，默认值只做兜底
export const siteName = process.env.SITE_NAME?.trim() || 'Neon Radio'
export const siteDescription = process.env.SITE_DESCRIPTION?.trim() || 'Neon Radio'
