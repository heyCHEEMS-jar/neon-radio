<div align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</div>

<br />

<div align="center">
  <img src="https://react.dev/favicon.ico" width="48" alt="React Logo" />
  <h1>Neon Radio</h1>
  <p>面向固定网易云账号的个人电台，提供动态视觉界面、扫码登录与歌单查询。</p>
  <p>
    <img src="https://img.shields.io/badge/React_19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
    <img src="https://img.shields.io/badge/Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
    <img src="https://img.shields.io/badge/Fastify_5-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/pnpm-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
  </p>
</div>

## 项目简介

Neon Radio 使用 Next.js 构建电台界面，通过 Fastify 调用本地 ncm-api 模块，为一个固定网易云账号维护登录态和提供歌单数据。

项目目前处于开发阶段：已接入扫码登录、Cookie 刷新和歌单/歌曲查询接口。首页可视化使用模拟频谱，实际音乐播放与歌单界面尚未完整接通。

## 功能特性

- **动态视觉界面**：视频背景、封面动画与模拟频谱，适配桌面和移动屏幕。
- **快捷功能入口**：电脑右键、手机长按屏幕打开 shadcn/ui ContextMenu。
- **扫码登录**：居中二维码弹窗，支持点击遮罩关闭，生成按钮带防抖和加载锁。
- **固定账号校验**：服务端核对扫码账号与 `NETEASE_UID`，其他账号不能覆盖原登录态。
- **登录态维护**：Cookie 仅保存在服务端，支持持久化与定时刷新，失效后重新扫码。
- **歌单查询**：读取固定账号的歌单以及指定歌单中的歌曲，默认每页 5 条。
- **扫码请求缓存**：按访客 IP 复用 30 秒内的二维码，扫码状态缓存 5 秒。
- **统一启动**：开发环境同时启动前端和服务端，生产环境通过 PM2 管理两个进程。

## 工作方式

```text
浏览器
  │
  ▼
Next.js 前端（3003）
  └─ /neon-radio/* 代理
      ▼
Fastify 服务端（4003）
  ├─ 本地 ncm-api 模块
  ├─ 固定 UID 校验与 Cookie 刷新
  └─ .data/netease-session.json
```

开发与生产环境均保留前端、服务端两个端口。浏览器通过前端的同源代理访问业务接口。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Next.js 16、React 19、TypeScript |
| 界面 | Tailwind CSS 4、shadcn/ui、Radix UI、Lucide |
| 视觉效果 | Canvas、Framer Motion、模拟频谱 |
| 服务端 | Node.js、Fastify 5、TypeScript |
| 网易云接口 | 本地 ncm-api、`@fastify/express` 兼容挂载 |
| 启动与进程管理 | pnpm、tsx、PM2 |

## 快速开始

### 1. 安装依赖

在项目根目录执行：

```bash
pnpm install
```

项目声明要求 Node.js `20.12.0` 或以上。

### 2. 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

填写 `.env` 中的 `NETEASE_UID`，值为网易云个人主页链接里 `id=` 后面的数字，不是手机号。其他配置按需调整，完整模板见 [.env.example](./.env.example)。

### 3. 启动开发环境

```bash
pnpm dev
```

启动脚本会检查并安装依赖，然后同时启动前端和服务端：

- 电台界面：<http://localhost:3003>
- 服务端接口前缀：`http://localhost:4003/neon-radio`

电脑右键或手机长按屏幕，选择“登录电台”，使用配置的网易云账号扫码并确认。

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `NETEASE_UID` | 固定网易云账号 UID，必须填写 | 无 |
| `WEB_PORT` | 前端访问端口 | `3003` |
| `API_PORT` | 服务端内部端口 | `4003` |
| `COOKIE_REFRESH_HOURS` | Cookie 刷新间隔，单位小时，范围 1～24 | `6` |
| `PACKAGE_TOOL` | 启动脚本使用的包管理器：pnpm、npm 或 yarn | `pnpm` |

Cookie 由扫码登录获取，无需保存账号密码。登录态写入 `.data/netease-session.json`，该目录已被 Git 忽略。

## 接口说明

浏览器与服务端使用相同的 `/neon-radio` 前缀。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/neon-radio/lists` | 获取固定账号的歌单 |
| GET | `/neon-radio/lists/:id/songs` | 获取指定歌单中的歌曲 |
| GET | `/neon-radio/login` | 读取服务端已保存的登录状态 |
| POST | `/neon-radio/login` | 提交 Cookie，经 UID 校验后保存 |
| POST | `/neon-radio/login-qr` | 生成或复用当前 IP 的二维码 |
| POST | `/neon-radio/login-qr/:key` | 查询扫码状态，授权后校验账号并保存 Cookie |

歌单和歌曲接口支持 `limit`、`offset`，默认分别为 `5`、`0`，`limit` 范围为 1～1000。

原生 ncm-api 挂载于 `/neon-radio/ncm`。原生二维码 Key 与状态查询也接入应用缓存，扫码结果不向浏览器返回账号 Cookie。公网部署前应评估是否需要开放其他原生接口。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动前端与服务端开发环境 |
| `pnpm start` | 构建前端并通过 PM2 启动生产服务 |
| `pnpm log` | 查看 PM2 日志 |
| `pnpm stop` | 停止电台的 PM2 生产进程 |
| `pnpm --dir frontend build` | 仅构建前端 |

## 生产部署

```bash
pnpm start
```

启动脚本会检查依赖、构建 Next.js 前端，并通过 PM2 分别启动 Fastify 和 Next.js。生产日志保存在 `logs/`。

建议在公网入口配置 HTTPS 反向代理，服务端端口仅供本机或可信内网访问，不直接开放公网。持久化保存 `.data/`，并限制该目录的文件访问权限。

### IP 转发与防伪造

**不能直接信任客户端提供的 `X-Forwarded-For`。**

服务端只信任本机回环代理，但 Next.js 可能保留客户端自带的转发头。因此，仅限制 Fastify 的代理信任范围，仍不足以防止伪造 IP 绕过扫码限频。

在公网入口 Nginx 的代理配置中，覆盖转发头：

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

- 使用 Fastify 的 `request.ip` 进行限频，不直接取客户端转发头作为访客标识。
- 如果前面还有 CDN 或其他代理，先按可信代理网段配置真实 IP 解析，否则 `$remote_addr` 可能是代理地址。
- 同一公网出口 IP 会共享二维码缓存；IP 只用于限频，不用于证明账号身份。
- 当前缓存位于单个服务进程内，多进程之间不会自动共享。
- 按 IP 限频不能阻止换 IP 请求，也不能保证不会触发网易云风控。

不要提交 `.env`、`.data` 或真实 Cookie，也不要把 Cookie 写入前端配置或日志。

## 项目结构

```text
neon-radio/
├─ frontend/               # Next.js 界面、二维码弹窗与视觉效果
├─ server/
│  ├─ routes/              # 主路由、歌单与登录接口
│  ├─ services/            # 登录态维护与二维码缓存
│  ├─ hooks/               # 原生扫码接口缓存接入
│  ├─ utils/               # ncm-api 类型衔接与 Cookie 工具
│  └─ ncm-api/             # 本地网易云接口模块
├─ .data/                  # 登录态文件，不提交 Git
├─ .env.example            # 环境变量模板
├─ start.js                # 开发与生产启动入口
├─ README.md
└─ README.en.md
```

## 常见问题

### 启动时提示 UID 无效

填写根目录 `.env` 中的 `NETEASE_UID`，然后重启项目。空值会导致服务端启动失败。

### 页面收到 500 或非 JSON 响应

检查服务端启动日志、`NETEASE_UID` 和 `API_PORT`，确认前端代理能够连接服务端。修改 Next.js 代理配置后需要重启前端。

### 多次点击生成，仍然显示同一个二维码

这是按 IP 缓存的预期行为：30 秒内重复请求复用旧二维码，不再次请求网易云。

### Cookie 过期或会员歌曲不可用

定时刷新不保证登录态永久有效，明确失效后需要重新扫码。会员权限、版权和地区限制由网易云决定，Cookie 不保证所有歌曲都能播放。

## 许可证

使用 [ISC License](./LICENSE)。本地 ncm-api 及其他依赖的许可与使用要求以各自项目为准。
