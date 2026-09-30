# Engraved Word — Product Requirements Document

## Original Problem Statement
"Create a meeting app like Google Meet." App named **Engraved Word**.

### User Choices
- Video: Real video/audio calls via WebRTC (peer-to-peer mesh)
- Features: create/join via room link/code, camera/mic toggle + screen share, in-meeting text chat
- Auth: Email + password (JWT). Hosts must sign in to create; guests join via link with a display name only.
- Declined: Emergent Google sign-in and Perplexity integration (user chose to skip)

## Architecture
- **Frontend**: React 19, Tailwind, shadcn/ui, sonner, lucide-react. Dark "obsidian & copper" theme.
- **Backend**: FastAPI + MongoDB (motor). JWT auth (httpOnly cookie + Bearer/localStorage fallback).
- **Realtime**: FastAPI WebSocket `/api/ws/{code}` as WebRTC signaling relay (SDP/ICE), plus chat + media-state broadcast. Mesh topology with Google STUN.

## User Personas
- **Host**: signed-in user who creates and shares meeting rooms.
- **Guest**: anyone with a link; joins with a display name, no account.

## Core Requirements (static)
- One-click instant meeting creation with shareable room code (abc-def-ghi).
- Pre-join lobby: camera preview, name, mic/cam toggles.
- In-call: adaptive video tile grid, control bar (mic, cam, screen share, chat, participants, copy link, leave), live chat + participant list.

## Implemented (2026-06-29)
- JWT auth: register/login/logout/me; admin seeding; unique indexes. ✅
- Meetings: create (auth), public lookup, host's recent list. ✅
- WebRTC mesh signaling over WebSocket; camera/mic toggle; screen share with track replace; live chat; join/leave toasts. ✅
- Full UI: Landing, Login, Register, Lobby, Meeting room. ✅
- **Host Controls**: host-only mute / remove / pin-for-all (host identity derived server-side from JWT vs meeting.host_id). ✅
- **Raise Hand + Reactions**: hand indicators on tiles + people list; floating emoji reactions. ✅
- **Meetings Dashboard** (/dashboard): create instant/scheduled meetings, waiting-room toggle, Upcoming/Recent sections, join/copy/delete. Backend PATCH/DELETE /api/meetings (host-only). ✅
- **Waiting Room**: guests knock, host approves/denies before entry; waiting/denied/removed gate screens. ✅
- **Session Recording**: host-only in-browser recording — composites all video tiles onto a canvas + mixes everyone's audio, downloads a `.webm`. No screen-share prompt. ✅
- **Active Speaker**: WebAudio level analysis auto-highlights (emerald ring) and auto-spotlights the current speaker when 3+ people and nothing is manually pinned. ✅
- **Meeting Reminders**: host adds invitee emails when scheduling; platform cron (`/api/cron/reminders`, every 15 min, bearer-secured) emails host + invitees 30 and 10 min before start via Emergent-managed Resend. ✅
- **Lobby Chat**: waiting guests message the host and get replies (per-guest thread in the knock panel) before admission. ✅
- Verified: testing agent 100% pass (iteration_1 → iteration_3).

## Backlog
- **P1**: TURN server for restrictive networks (currently STUN-only); clear-schedule via PATCH (sentinel).
- **P2**: meeting transcript/notes, calendar (.ics) attachments on reminders, server-side/cloud recording, breakout rooms.
- **Known limits**: signaling + recording are per-client/in-memory (single worker); mesh topology best for small groups; reminder cadence is 15 min (so 30/10-min reminders fire within their windows, not to the exact second).

## Next Tasks
- Optional TURN integration for reliability behind strict NATs.
- Calendar invite (.ics) attached to scheduling + reminder emails.
