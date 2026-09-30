# Engraved Word

A Google Meet-style video conferencing web app: instant and scheduled meetings, waiting rooms, in-call chat, reactions, host controls, and automatic email reminders — all from the browser, with no downloads or plugins.

## Overview

Engraved Word lets a host create a meeting in one click, share a room code or link, and admit guests through a waiting room into a peer-to-peer video call. Video, audio, and screen sharing run directly between participants over WebRTC; a WebSocket signaling server coordinates session setup, presence, and moderation. The product is a full-stack SPA: a React frontend talking to a FastAPI backend over a JSON/REST + WebSocket API.

## Features

### Authentication
- Email/password **register** and **login** with bcrypt-hashed passwords
- 7-day access tokens issued as **HTTP-only cookies** (with `Bearer` header fallback)
- Role-based accounts (`admin`, `host`); an admin account is seeded automatically on boot
- Session logout endpoint that clears the cookie

### Meetings
- **Instant meetings** — one click generates a human-friendly room code like `abc-def-ghi`
- **Scheduled meetings** with title, time, and an invitee list
- Per-meeting **waiting room toggle**
- Host dashboard listing all meetings with live participant counts
- Edit (rename, reschedule, retoggle waiting room, manage invitees) and delete, host-only
- Deep links: `https://<app>/j/<room-code>` for one-tap joining

### Video conferencing (WebRTC mesh)
- Peer-to-peer **mesh topology** — no media server; each participant sends/receives streams directly
- Camera + microphone publish, mute/unmute, camera on/off, **screen sharing**
- Dynamic **tile layout** with active-speaker presentation
- Connection quality/leave handling with graceful peer departure notices

### Signaling & moderation (WebSocket)
- Offer/answer/**ICE exchange** to establish each peer connection
- **Waiting room flow**: guests "knock" → host sees them in a lobby → admit or deny, with optional **lobby chat** between host and waiting guest
- Host controls: **force-mute** a participant, **remove** a participant, **pin** a participant's video
- Participant state broadcast: audio/video status, **raised hands**, join/leave events
- **In-call text chat** (direct + broadcast messages with timestamps)

### Reactions & engagement
- Floating **emoji reactions** during the call
- Raise-hand with host visibility

### Email reminders
- Cron-driven **reminder emails** at 30 minutes and 10 minutes before a scheduled meeting
- Secured by a shared-secret webhook (`Authorization: Bearer <WEBHOOK_CRON_SECRET>`)
- Reminder content includes title, host, room code, and a direct join link
- Emails are built and vetted by a hardened sending pipeline (see Security)

## Architecture

```
Browser (React SPA)
├── REST  ──▶  /api/...        auth, meeting CRUD, cron webhook
└── WebSocket ─▶ /api/ws/{code}  WebRTC signaling, presence, chat, moderation

FastAPI backend
├── JWT issuing/verification, role checks, CORS
├── WebSocket room hub (in-memory room state per meeting code)
├── Supabase Postgres — users, meetings (asyncpg pool)
└── Reminder job → email safety scanner → transactional email proxy
```

- **Frontend** renders pages via client-side routing (`/`, `/login`, `/register`, `/dashboard`, `/lobby`, `/meeting`, `/j/:code`) and keeps meeting state in React context/hooks.
- **WebRTC** carries all media peer-to-peer; the server only ever sees small JSON signaling messages — it never touches audio/video.
- The signaling server keeps live room state (peers, waiting list, pin) in memory for the lifetime of a meeting and broadcasts structured events (`welcome`, `peer-joined`, `knock`, `chat`, `media-state`, `raise-hand`, `reaction`, `force-mute`, …).
- The reminder job scans upcoming scheduled meetings, resolves recipients (host + invitees), de-duplicates per meeting so each reminder is sent once, and hands off to the email pipeline.

## Tech stack

| Layer | Technology |
|---|---|
| UI | React 19, Tailwind CSS, Radix UI / shadcn components, Framer Motion, Lucide icons |
| Routing & data | React Router 7, Axios, TanStack Query, React Hook Form + Zod |
| Build | Create React App (craco), PostCSS, ESLint |
| API | FastAPI, Starlette, Pydantic v2 (validation), Uvicorn |
| Realtime | Native WebSockets (server) + `WebSocket` API (client), WebRTC |
| Auth | PyJWT (HS256), bcrypt, HTTP-only cookies |
| Database | **Supabase** (PostgreSQL) via `asyncpg` connection pool |
| Email | `httpx` client to a transactional email proxy, HTML templating with strict escaping |
| Tests | Pytest (+ xdist), integration test suites with JSON/XML reports |

## Security highlights

Emails are passed through an aggressive anti-phishing scanner before sending:

- **No forms/inputs** allowed in email HTML
- Blocks credential/phishing phrases ("reply with your password", "seed phrase", "cvv", …)
- **HTTPS-only links**; rejects shorteners (bit.ly, t.co, …), raw IP and punycode hosts, and URLs embedding credentials
- **Anchor-text mismatch detection** — visible host in link text must match the real link destination

Plus: bcrypt password hashing, short-lived scoped JWTs, HTTP-only `SameSite=None` cookies for cross-origin deploys, host-only meeting mutation endpoints, and secret-protected cron endpoints.

## Deployment

- **Frontend** → Vercel (static build, environment-driven API base URL)
- **Backend** → Render (Python web service, WebSocket-capable, health-checked at `/api/`)
- **Database** → Supabase (managed Postgres; schema and admin seed are created automatically on service startup)

## Project structure

```
├── backend/
│   ├── server.py          # FastAPI app: auth, meetings, cron, WS signaling hub
│   ├── email_utils.py     # Email safety scanner + reminder template
│   ├── db.py              # Supabase connection pool + schema bootstrap
│   └── tests/             # Integration test suites
├── frontend/
│   ├── src/pages/         # Landing, Login, Register, Dashboard, Lobby, Meeting
│   ├── src/components/    # VideoTile, ControlBar, ChatPanel + UI kit
│   ├── src/hooks/         # useWebRTC (mesh peer management)
│   ├── src/lib/           # api client, recorder, utils
│   └── vercel.json        # Vercel build config
└── render.yaml            # Backend deployment blueprint
```
