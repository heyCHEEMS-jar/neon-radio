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
  ├─ audio/           音频黑盒：下载 → ffmpeg → Worker 分析 → 时间轴入库
  ├─ platform/*       MySQL、网易云适配、Cookie、加密
  ├─ vendor/ncm-api   本地网易云接口模块（只读）
  └─ MySQL
```

服务端启动时自动建库、执行迁移，并恢复已保存的网易云登录态。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js 16、React 19、TypeScript、Tailwind CSS 4、Radix UI |
| 视觉 | Canvas、Web Animations、Framer Motion |
| 服务端 | Node.js、Fastify 5、TypeScript、Drizzle ORM、MySQL |
| 实时 | WebSocket（`ws`） |
| 音频分析 | ffmpeg-static、Essentia.js、Worker Threads |
| 启动与进程 | pnpm、tsx、PM2 |

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
