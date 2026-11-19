# 贡献与协作规则

本文件面向所有改代码的人和 AI 助手。项目按三层组织，**依赖只能向下**。

## 分层

```text
入口层   server/routes  server/live  server/app.ts
         只做参数校验、鉴权、调用业务、编码响应
业务层   server/modules/*
         只做业务判断、状态编排；service.ts 不写 SQL、不碰 fastify/ws
工具层   server/platform/*  server/audio/*  frontend/src/audio/*
         数据库、HTTP、加密、第三方适配、音频全链路
第三方   server/vendor/ncm-api      只读，不修改
```

- 反向依赖用注入：`audio/` 需要音频地址时，由 `app.ts` 传入 `resolveSrc`。
- 同层模块只通过对方 `index.ts` 交互。
- 跨端类型、运行时 schema、WS 消息只在 `packages/protocol` 定义，前后端不得各写一份。
- `server/modules/<domain>/store.ts` 是唯一允许写该领域 SQL 的地方。

## 音频层铁律

- 震动只能由服务端已入库的时间轴驱动。**禁止**为“看起来有反馈”加入实时频谱兜底。
- 试听裁切音频不得使用完整曲目的时间轴。
- `AUDIO_ANALYSIS_VERSION` 变更等于全量重算，必须说明影响。
- 音频层以外的代码不得出现 ffmpeg、Worker、PCM、Essentia、AnalyserNode、频谱采样。

## 前端约定

- 所有 `*.module.css` 统一放在 `frontend/src/styles/`，组件通过 `@/styles/*.module.css` 引入。

## 不做的事

- 不修改 `server/vendor/ncm-api`。
- 不改变 `platform/crypto.ts` 的密文格式（version + nonce + authTag + ciphertext），否则已有部署全部掉登录。
- 不把网易云 Cookie 写入前端、日志或接口响应。
- 不为了“更工程化”引入没有实际使用场景的抽象。

## 提交前检查

```bash
pnpm typecheck      # server + frontend
pnpm build          # Next.js 生产构建
```

行为变更需要手动验证：扫码登录、播放与拖动、游客漫游、强制主线同步、断线重连、震动触发。
