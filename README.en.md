<div align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</div>

<br />

<div align="center">
  <img src="https://react.dev/favicon.ico" width="48" alt="React Logo" />
  <h1>Neon Radio</h1>
  <p>A personal radio for a fixed NetEase Cloud Music account, with animated visuals, QR login, and playlist queries.</p>
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

## Overview

Neon Radio uses Next.js for its radio interface and Fastify to call a local ncm-api module. It maintains the login session and provides playlist data for one fixed NetEase Cloud Music account.

The project is under development. QR login, Cookie refresh, and playlist/song query APIs are implemented. The home page currently uses simulated spectrum data; real music playback and playlist UI integration are not yet complete.

## Features

- **Animated visuals**: Video backgrounds, cover animations, and a simulated spectrum for desktop and mobile screens.
- **Quick access**: Right-click on desktop or long-press on mobile to open a shadcn/ui ContextMenu.
- **QR login**: A centered QR dialog that closes on backdrop clicks, with a debounced generation button and a loading lock.
- **Fixed-account validation**: The server checks the scanned account against `NETEASE_UID`. Other accounts cannot replace the existing session.
- **Session maintenance**: Cookies stay on the server, with persistence and scheduled refresh. Scan again when the session expires.
- **Playlist queries**: Fetch the fixed account's playlists and the songs in a selected playlist, with 5 items per page by default.
- **QR request caching**: Reuse QR codes for 30 seconds per visitor IP and cache scan status for 5 seconds.
- **Unified startup**: Start the frontend and server together in development, and manage both production processes with PM2.

## How It Works

```text
Browser
  │
  ▼
Next.js frontend (3003)
  └─ /neon-radio/* proxy
      ▼
Fastify server (4003)
  ├─ Local ncm-api module
  ├─ Fixed UID validation and Cookie refresh
  └─ .data/netease-session.json
```

Both development and production retain separate frontend and server ports. The browser uses the frontend's same-origin proxy to access the application APIs.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Frontend | Next.js 16, React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui, Radix UI, Lucide |
| Visual effects | Canvas, Framer Motion, simulated spectrum |
| Server | Node.js, Fastify 5, TypeScript |
| NetEase integration | Local ncm-api, mounted through `@fastify/express` |
| Startup and process management | pnpm, tsx, PM2 |

## Quick Start

### 1. Install Dependencies

Run from the project root:

```bash
pnpm install
```

The project declares Node.js `20.12.0` or newer and pnpm `12.6.0`. See [package.json](./package.json) for version settings.

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Set `NETEASE_UID` in `.env` to the numeric value after `id=` in your NetEase profile URL, not your phone number. Adjust other settings as needed; see [.env.example](./.env.example) for the full template.

### 3. Start Development

```bash
pnpm dev
```

The startup script checks and installs dependencies, then launches the frontend and server:

- Radio interface: <http://localhost:3003>
- Server API prefix: `http://localhost:4003/neon-radio`

Right-click on desktop or long-press on mobile, choose the radio login option, and scan and confirm with the configured NetEase account.

## Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `NETEASE_UID` | Fixed NetEase account UID; required | None |
| `WEB_PORT` | Frontend port | `3003` |
| `API_PORT` | Internal server port | `4003` |
| `COOKIE_REFRESH_HOURS` | Cookie refresh interval in hours, from 1 to 24 | `6` |
| `PACKAGE_TOOL` | Package manager used by the startup script: pnpm, npm, or yarn | `pnpm` |

Cookies are obtained through QR login; account passwords do not need to be stored. The session is written to `.data/netease-session.json`, and that directory is excluded from Git.

## API Reference

The browser and server use the same `/neon-radio` prefix.

| Method | Path | Description |
| --- | --- | --- |
| GET | `/neon-radio/lists` | Fetch the fixed account's playlists |
| GET | `/neon-radio/lists/:id/songs` | Fetch songs in a selected playlist |
| GET | `/neon-radio/login` | Read the login state saved on the server |
| POST | `/neon-radio/login` | Submit a Cookie and save it after UID validation |
| POST | `/neon-radio/login-qr` | Generate or reuse a QR code for the current IP |
| POST | `/neon-radio/login-qr/:key` | Check scan status, validate the authorized account, and save its Cookie |

Playlist and song queries accept `limit` and `offset`, defaulting to `5` and `0`. The supported `limit` range is 1–1000.

The native ncm-api is mounted at `/neon-radio/ncm`. Native QR key and status queries also use the application cache, and scan responses do not return account Cookies to the browser. Evaluate whether other native endpoints need to be publicly exposed before deployment.

## Common Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the frontend and server in development |
| `pnpm start` | Build the frontend and start production services with PM2 |
| `pnpm log` | View PM2 logs |
| `pnpm stop` | Stop the radio's production PM2 processes |
| `pnpm --dir frontend build` | Build only the frontend |

## Production Deployment

```bash
pnpm start
```

The startup script checks dependencies, builds the Next.js frontend, and starts Fastify and Next.js as separate PM2 processes. Production logs are stored in `logs/`.

Use an HTTPS reverse proxy at the public entry point. Keep the server port accessible only from localhost or a trusted internal network, not directly from the internet. Persist `.data/` and restrict access to its files.

### Forwarded IPs and Spoofing Protection

**Do not directly trust a client-supplied `X-Forwarded-For` header.**

The server trusts only loopback proxies, but Next.js may preserve forwarding headers supplied by the client. Restricting Fastify's trusted proxies alone is therefore insufficient to prevent spoofed IPs from bypassing QR request limits.

Overwrite forwarding headers in the public-facing Nginx proxy configuration:

```nginx
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Real-IP $remote_addr;
```

- Use Fastify's `request.ip` for request limits, rather than directly treating client forwarding headers as visitor identifiers.
- If a CDN or another proxy sits in front of the entry point, first configure real-IP resolution for trusted proxy networks; otherwise, `$remote_addr` may be the proxy's address.
- Visitors sharing a public IP also share the QR cache. IP addresses are used for request limits, not account authentication.
- The current cache lives in a single server process and is not automatically shared across multiple processes.
- Per-IP limits cannot stop requests from changing IPs and do not guarantee that NetEase risk controls will never be triggered.

Do not commit `.env`, `.data`, or real Cookies, and do not place Cookies in frontend configuration or logs.

## Project Structure

```text
neon-radio/
├─ frontend/               # Next.js UI, QR dialog, and visual effects
├─ server/
│  ├─ routes/              # Main routes, playlists, and login endpoints
│  ├─ services/            # Session maintenance and QR cache
│  ├─ hooks/               # Native QR endpoint cache integration
│  ├─ utils/               # ncm-api type bridge and Cookie utilities
│  └─ ncm-api/             # Local NetEase API module
├─ .data/                  # Session files, excluded from Git
├─ .env.example            # Environment variable template
├─ start.js                # Development and production entry point
├─ README.md
└─ README.en.md
```

## FAQ

### Startup reports an invalid UID

Set `NETEASE_UID` in the root `.env` file and restart the project. An empty value prevents the server from starting.

### The page receives a 500 or a non-JSON response

Check server startup logs, `NETEASE_UID`, and `API_PORT`. Ensure the frontend proxy can reach the server. Restart the frontend after changing the Next.js proxy configuration.

### Repeated generation requests show the same QR code

This is expected per-IP caching behavior. Requests within 30 seconds reuse the previous QR code without calling NetEase again.

### The Cookie expires or a VIP song is unavailable

Scheduled refresh does not guarantee a permanent session. Scan again after confirmed expiration. Membership permissions, copyright, and regional restrictions are controlled by NetEase; a Cookie does not guarantee playback of every song.

## License

Licensed under the [ISC License](./LICENSE). The local ncm-api module and other dependencies remain subject to their respective licenses and usage requirements.
