<div align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</div>

<br />

<div align="center">
  <h1>Neon Radio</h1>
  <p>A personal web radio for one fixed NetEase Cloud Music account: shared playback, guest roaming, playlist sync, and audio-driven visuals.</p>
  <p>
    <img src="https://img.shields.io/badge/React-19-20232A?style=flat-square&logo=react&logoColor=61DAFB" alt="React 19" />
    <img src="https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
    <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
    <img src="https://img.shields.io/badge/Fastify-5-000000?style=flat-square&logo=fastify&logoColor=white" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/WebSocket-live-010101?style=flat-square&logo=socketdotio&logoColor=white" alt="WebSocket" />
    <img src="https://img.shields.io/badge/MySQL-database-4479A1?style=flat-square&logo=mysql&logoColor=white" alt="MySQL" />
    <img src="https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black" alt="Drizzle ORM" />
    <img src="https://img.shields.io/badge/pnpm-workspace-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm" />
    <img src="https://img.shields.io/badge/Node.js-20+-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 20+" />
  </p>
</div>

## Getting started

Requires Node.js `20.12.0+` and a MySQL instance.

```bash
pnpm install
cp .env.example .env
```

Fill in `NETEASE_UID`, `NETEASE_COOKIE_ENCRYPTION_KEY`, and the `DB_*` variables in `.env`. Then run:

```bash
pnpm start
```

- Frontend: <http://localhost:3003>
- API: <http://localhost:4003/neon-radio>

## Features

- **Shared main playback**: one server-side clock; every listener hears the same song at the same position.
- **Guest roaming**: admins can let guests pick songs, seek, and skip without touching the main station.
- **Forced sync**: an admin can push their own playback state to the main station.
- **Playlist roaming**: syncs every playlist of the account, fetches only missing details, then replaces the list transactionally and deduplicates by song and artist. Lyrics, chorus ranges, and timelines of removed songs are cleaned up.
- **Lyrics and chorus**: fetched on demand and cached in MySQL; chorus ranges trigger the light-pillar visuals.
- **Listener count**: bottom-left shows online listeners; hover reveals the top 10 songs by listener count.
- **QR login**: encrypted cookie storage, scheduled refresh, and re-login after invalidation.

## How it works

```text
Browser
  │  /neon-radio/* (Next.js same-origin proxy)
  ▼
Next.js (3003)
  ▼
Fastify (4003)
  ├─ modules/*        session, roaming, playback, lyrics, chorus, settings
  ├─ audio/*          download → ffmpeg → worker analysis → timeline
  ├─ platform/*       MySQL, NetEase adapters, cookies, crypto
  ├─ vendor/ncm-api   vendored NetEase API (read-only)
  └─ MySQL
```

## Stack

| Layer | Main dependencies |
| --- | --- |
| Frontend | Next.js 16 (Turbopack), React 19, TypeScript |
| Styling and UI | Tailwind CSS 4, Radix UI, shadcn/ui structure, Lucide, clsx, tailwind-merge, Sonner |
| Motion and visuals | Framer Motion, GSAP, Canvas 2D, Web Audio API, WebGL2 |
| Server | Fastify 5, @fastify/cookie, @fastify/express, @fastify/rate-limit, `ws` |
| Data | MySQL, mysql2, Drizzle ORM, drizzle-kit |
| Audio analysis | ffmpeg-static, Essentia.js, Worker Threads, execa |
| NetEase API | NeteaseCloudMusicApiEnhanced, `@neteasecloudmusicapienhanced/unblockmusic-utils` |
| Contracts | `@neon-radio/protocol` (workspace), zod |
| Tooling | pnpm, tsx, concurrently, PM2, PostCSS |

## Project structure

```text
neon-radio/
├─ packages/protocol/           shared types and validation
├─ frontend/src/audio/          audio layer (playback, spectrum, impacts)
├─ frontend/src/features/radio/ radio UI and live connection
├─ server/modules/              business modules
├─ server/audio/                audio layer (download, decode, analyse)
├─ server/platform/             DB, HTTP, crypto, NetEase adapters
└─ server/vendor/ncm-api/       third-party, read-only
```

## Third-party assets

- **NetEase API**: [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced), vendored as `@neteasecloudmusicapienhanced/api` v4.41.1. Use it for personal radio only and respect the NetEase Cloud Music terms of service.
- **Background video**: **"Synth City by Visualdon - 4K 60fps"** by **VISUALDON**, sourced from Wallpaper Engine. The video remains the property of its author; `frontend/public/videos/loop.webm` is for demonstration only. Obtain permission or replace it before public distribution or commercial use.
