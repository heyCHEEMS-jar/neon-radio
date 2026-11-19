<div align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</div>

<br />

<div align="center">
  <h1>Neon Radio</h1>
  <p>面向固定网易云账号的个人电台：主线播放、游客本地漫游、歌单同步与音频冲击可视化。</p>
  <p>
    <img src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
    <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Fastify_5-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/MySQL-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
    <img src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  </p>
</div>

## 项目简介

Neon Radio 为一个固定网易云账号提供可长期运行的网页电台。浏览器打开页面即可收听主电台；管理员扫码登录后可以管理播放、同步歌单，并允许游客在不影响主线的情况下自行漫游。

音频的起音时间轴由服务端离线分析并入库，前端只根据真实时间轴触发画面冲击，不使用实时频谱伪造节奏。

## 快速开始

要求 Node.js `20.12.0` 或以上、可用的 MySQL 实例。

```bash
pnpm install
cp .env.example .env
```

编辑 `.env`，至少填写 `NETEASE_UID`（个人主页 `id=` 后的数字）、`NETEASE_COOKIE_ENCRYPTION_KEY` 和 `DB_*`。生成密钥：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

启动开发环境：

```bash
pnpm dev
```

- 电台界面：<http://localhost:3003>
- 服务端接口：<http://localhost:4003/neon-radio>

电脑右键或手机长按页面，选择“登录电台”扫码。登录成功后后台会自动同步歌单并补齐音频时间轴。

其他脚本：`pnpm typecheck`、`pnpm build`、`pnpm start`（生产，PM2）、`pnpm clean`。

## 功能

- **主线电台**：服务端维护唯一播放时钟，所有听众共享歌曲和进度。
- **游客漫游**：管理员可放行游客自行选歌、拖动和切歌，不影响主线。
- **强制主线同步**：管理员可把自己的播放状态推送到主线。
- **歌单漫游**：定时同步账号下全部歌单，事务替换入库，按歌名与歌手去重。
- **扫码登录**：二维码登录、Cookie 加密入库、定时刷新、失效后重新扫码。
- **动态视觉**：视频背景、封面缓动、圆环与边缘频谱、按时间轴触发的冲击动画。

## 工作方式

```text
浏览器
  │  /neon-radio/*（Next.js 同源代理）
  ▼
Next.js 前端（3003）
  ▼
Fastify 服务端（4003）
  ├─ modules/*        业务：会话、漫游、播放、设置
  ├─ audio/           音频：下载 → ffmpeg → Worker 分析 → 时间轴入库
  ├─ platform/*       MySQL、网易云适配、Cookie、加密
  ├─ vendor/ncm-api   本地网易云接口模块（只读）
  └─ MySQL
```

服务端启动时自动建库、执行迁移，并恢复已保存的网易云登录态。

## 技术栈

| 层级 | 技术 / 库 |
| --- | --- |
| 前端框架 | Next.js 16（Turbopack）、React 19、TypeScript |
| 样式与 UI | Tailwind CSS 4、shadcn/ui 结构、Radix UI（Context Menu / Dialog / Switch）、Lucide、clsx、tailwind-merge、Sonner |
| 动画与视觉 | Framer Motion、GSAP（BlurText）、Web Animations API、Canvas 2D、Web Audio API |
| WebGPU | vgpu（vercel-labs）、AeroShards 着色器（副歌碎片层） |
| 服务端 | Fastify 5、@fastify/cookie、@fastify/express、@fastify/rate-limit、cookie、set-cookie-parser |
| 实时通信 | WebSocket（`ws`） |
| 数据库 | MySQL、mysql2、Drizzle ORM、drizzle-kit |
| 音频分析 | ffmpeg-static、Essentia.js、Worker Threads、execa |
| 网易云接口 | NeteaseCloudMusicApiEnhanced（`@NeteaseCloudMusicApiEnhanced/api-enhanced`，仓库内以 `@neteasecloudmusicapienhanced/api` v4.41.1 内置）、`@neteasecloudmusicapienhanced/unblockmusic-utils` |
| 协议与校验 | `@neon-radio/protocol`（workspace）、zod |
| 构建与开发 | TypeScript（前端 6.x / 服务端 5.x）、PostCSS、Tailwind PostCSS、Drizzle Kit |
| 启动与进程 | pnpm、tsx、concurrently、PM2 |

内置 ncm-api 还会用到以下库（业务代码不直接依赖）：axios、crypto-js、node-forge、jsdom、qrcode、xml2js、fzstd、music-metadata、express、express-fileupload、pac-proxy-agent、tunnel、safe-decode-uri-component。

## 项目结构

```text
neon-radio/
├─ packages/protocol/   前后端共享类型与校验
├─ frontend/src/audio/  音频黑盒（播放、频谱、震动）
├─ frontend/src/features/radio/   电台界面与实时连接
├─ server/modules/      业务模块（session / roaming / playback / settings）
├─ server/audio/        音频黑盒（下载、解码、分析、时间轴）
├─ server/platform/     DB、HTTP、加密、网易云适配
└─ server/vendor/ncm-api/   第三方，只读
```

入口层（`routes` / `live`）只做校验和转发，业务层不写 SQL，工具层承担数据库与第三方适配；依赖只能向下。音频黑盒对外只暴露各自的 `index.ts`。

## 第三方资源与致谢

- **网易云接口**：基于 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced) 的 `@NeteaseCloudMusicApiEnhanced/api-enhanced`（仓库内以 `@neteasecloudmusicapienhanced/api` v4.41.1 内置）与 `@neteasecloudmusicapienhanced/unblockmusic-utils`。仅用于个人电台，请遵守网易云音乐服务条款。
- **文字动画**：`BlurText` 来自 React Bytes。
- **界面组件**：`DraggableGrid` / `TiltedCard` 来自 Originkit，位于 `frontend/src/components/vendor/originkit`。
- **WebGPU 视觉**：`AeroShards` 场景基于 [vgpu](https://github.com/vercel-labs/vgpu) 与项目作者提供的着色器。
- **背景视频**：**“Synth City by Visualdon - 4K 60fps”**，作者 **VISUALDON**，来自 Wallpaper Engine。视频版权归原作者所有，仓库内的 `frontend/public/videos/loop.webm` 仅供本项目演示；公开分发或商用前请自行取得授权，或替换为自己的素材。
- **图标与基础组件**：Lucide、Radix UI、shadcn/ui。

