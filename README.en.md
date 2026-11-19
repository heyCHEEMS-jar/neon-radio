<div align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</div>

<br />

<div align="center">
  <h1>Neon Radio</h1>
  <p>A personal radio for one fixed NetEase Cloud Music account: main playback, guest roaming, playlist sync, and audio-driven visuals.</p>
</div>

## Overview

Neon Radio keeps a single NetEase account online and exposes it as a web radio. Listeners share one server-side playback clock. An administrator can sign in with a QR code, manage playback, sync playlists, and optionally let guests roam without affecting the main station.

Onset timelines are analysed offline on the server and stored in MySQL. The browser only triggers visual impacts from that stored timeline; it never fakes beats from a live spectrum.

## Getting started

Requires Node.js `20.12.0+` and a MySQL instance.

```bash
pnpm install
cp .env.example .env
```

Fill in `NETEASE_UID`, `NETEASE_COOKIE_ENCRYPTION_KEY` (Base64 of 32 random bytes), and the `DB_*` variables, then run:

```bash
pnpm dev
```

Open <http://localhost:3003>, right-click (or long-press on mobile), and scan the QR code with the configured account. Playlists and audio timelines sync in the background after login.

Other scripts: `pnpm typecheck`, `pnpm build`, `pnpm start` (production, PM2), `pnpm clean`.

## Features

- Shared main playback clock with server-side song selection.
- Guest roaming with per-connection local playback.
- Optional forced sync of an administrator's playback to the main station.
- Full playlist sync for the fixed account, deduplicated and replaced transactionally.
- QR login, encrypted cookie storage, scheduled refresh, and automatic invalidation.
- Animated visuals: video background, cover motion, spectrum ring and edges, timeline-driven impacts.

## How it works

```text
Browser
  │  /neon-radio/* (Next.js same-origin proxy)
  ▼
Next.js (3003)
  ▼
Fastify (4003)
  ├─ modules/*        session, roaming, playback, settings
  ├─ audio/           download → ffmpeg → worker analysis → timeline
  ├─ platform/*       MySQL, NetEase adapters, cookies, crypto
  ├─ vendor/ncm-api   local NetEase API module (read-only)
  └─ MySQL
```

The server creates the database, runs migrations, and restores the saved session on startup.

## Stack

| Layer | Libraries |
| --- | --- |
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript |
| UI and styling | Tailwind CSS 4, shadcn/ui structure, Radix UI, Lucide, clsx, tailwind-merge, Sonner |
| Motion and visuals | Framer Motion, GSAP (BlurText), Web Animations API, Canvas 2D, Web Audio API |
| WebGPU | vgpu (vercel-labs), AeroShards shaders |
| Server | Fastify 5, @fastify/cookie, @fastify/express, @fastify/rate-limit, cookie, set-cookie-parser |
| Realtime | WebSocket (`ws`) |
| Database | MySQL, mysql2, Drizzle ORM, drizzle-kit |
| Audio analysis | ffmpeg-static, Essentia.js, Worker Threads, execa |
| NetEase API | NeteaseCloudMusicApiEnhanced (`@NeteaseCloudMusicApiEnhanced/api-enhanced`, vendored as `@neteasecloudmusicapienhanced/api` v4.41.1), `@neteasecloudmusicapienhanced/unblockmusic-utils` |
| Contracts | `@neon-radio/protocol` (workspace), zod |
| Build and tooling | TypeScript (frontend 6.x / server 5.x), PostCSS, Tailwind PostCSS, Drizzle Kit |
| Launch | pnpm, tsx, concurrently, PM2 |

The vendored ncm-api also depends on axios, crypto-js, node-forge, jsdom, qrcode, xml2js, fzstd, music-metadata, express, express-fileupload, pac-proxy-agent, tunnel, and safe-decode-uri-component.

## Project structure

```text
neon-radio/
├─ packages/protocol/   shared types and validation
├─ frontend/src/audio/  audio black box (playback, spectrum, impacts)
├─ frontend/src/features/radio/   UI and live connection
├─ server/modules/      session, roaming, playback, settings
├─ server/audio/        audio black box (download, decode, analyse, timeline)
├─ server/platform/     DB, HTTP, crypto, NetEase adapters
└─ server/vendor/ncm-api/   third-party, read-only
```

Entry layers (`routes` / `live`) only validate and forward; business modules never write SQL; the platform layer owns the database and third-party adapters. Dependencies point downward only, and each audio black box is used through its `index.ts`.

## Credits and third-party assets

- **NetEase API**: NeteaseCloudMusicApiEnhanced (`@NeteaseCloudMusicApiEnhanced/api-enhanced`, vendored as `@neteasecloudmusicapienhanced/api` v4.41.1) and `@neteasecloudmusicapienhanced/unblockmusic-utils`. Use it for personal radio only and respect the NetEase Cloud Music terms of service.
- **Text animation**: `BlurText` comes from React Bytes.
- **UI components**: `DraggableGrid` and `TiltedCard` come from Originkit, located in `frontend/src/components/vendor/originkit`.
- **WebGPU visuals**: The `AeroShards` scene is built on [vgpu](https://github.com/vercel-labs/vgpu) with the shader provided by the project author.
- **Background video**: **"Synth City by Visualdon - 4K 60fps"** by **VISUALDON**, sourced from Wallpaper Engine. The video remains the property of its author; the copy in `frontend/public/videos/loop.webm` is for demonstration only. Obtain permission or replace it before public distribution or commercial use.
- **Icons and primitives**: Lucide, Radix UI, shadcn/ui.

