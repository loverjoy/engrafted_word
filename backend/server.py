from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import secrets
import string
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from fastapi import (
    FastAPI, APIRouter, HTTPException, Request, Response, Depends,
    WebSocket, WebSocketDisconnect,
)
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

import db

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET", "")
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000")

from email_utils import send_email, build_reminder_html

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        row = await db.pool.fetchrow("SELECT * FROM users WHERE id = $1", payload["sub"])
        if not row:
            raise HTTPException(status_code=401, detail="User not found")
        user = dict(row)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class MeetingCreate(BaseModel):
    title: Optional[str] = "Instant Meeting"
    scheduled_at: Optional[str] = None
    waiting_room: bool = True
    invitees: List[str] = []


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    scheduled_at: Optional[str] = None
    waiting_room: Optional[bool] = None
    invitees: Optional[List[str]] = None


def gen_room_code() -> str:
    alphabet = string.ascii_lowercase
    parts = ["".join(secrets.choice(alphabet) for _ in range(3)) for _ in range(3)]
    return "-".join(parts)


def set_auth_cookie(response: Response, token: str):
    response.set_cookie(key="access_token", value=token, httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower()
    if await db.pool.fetchval("SELECT 1 FROM users WHERE email = $1", email):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = uuid.uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()
    await db.pool.execute(
        "INSERT INTO users (id, name, email, password_hash, role, created_at) "
        "VALUES ($1, $2, $3, $4, 'host', $5)",
        uid, payload.name, email, hash_password(payload.password), created_at,
    )
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"user": {"id": uid, "name": payload.name, "email": email, "role": "host"}, "token": token}


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower()
    row = await db.pool.fetchrow("SELECT * FROM users WHERE email = $1", email)
    if not row or not verify_password(payload.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    uid = row["id"]
    token = create_access_token(uid, email)
    set_auth_cookie(response, token)
    return {"user": {"id": uid, "name": row["name"], "email": email, "role": row.get("role", "host")},
            "token": token}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return {"user": {"id": user["id"], "name": user["name"], "email": user["email"],
                     "role": user.get("role", "host")}}


# ---------------------------------------------------------------------------
# Meeting routes
# ---------------------------------------------------------------------------
@api_router.post("/meetings")
async def create_meeting(payload: MeetingCreate, user: dict = Depends(get_current_user)):
    code = gen_room_code()
    while await db.pool.fetchval("SELECT 1 FROM meetings WHERE code = $1", code):
        code = gen_room_code()
    doc = {
        "code": code,
        "title": payload.title or "Instant Meeting",
        "host_id": user["id"],
        "host_name": user["name"],
        "scheduled_at": payload.scheduled_at,
        "waiting_room": payload.waiting_room,
        "invitees": [e.strip() for e in (payload.invitees or []) if e.strip()],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.pool.execute(
        "INSERT INTO meetings (code, title, host_id, host_name, scheduled_at, waiting_room, invitees, "
        "reminder_30_sent, reminder_10_sent, created_at) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, FALSE, $8)",
        doc["code"], doc["title"], doc["host_id"], doc["host_name"], doc["scheduled_at"],
        doc["waiting_room"], doc["invitees"], doc["created_at"],
    )
    return {"code": code, "title": doc["title"], "host_name": doc["host_name"],
            "scheduled_at": doc["scheduled_at"], "waiting_room": doc["waiting_room"],
            "invitees": doc["invitees"]}


@api_router.get("/meetings/{code}")
async def get_meeting(code: str):
    m = await db.pool.fetchrow("SELECT * FROM meetings WHERE code = $1", code)
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    m = dict(m)
    room = rooms.get(code)
    active = len(room["peers"]) if room else 0
    return {"code": m["code"], "title": m["title"], "host_name": m["host_name"],
            "waiting_room": m.get("waiting_room", True),
            "scheduled_at": m.get("scheduled_at"),
            "active_participants": active}


@api_router.get("/meetings")
async def my_meetings(user: dict = Depends(get_current_user)):
    rows = await db.pool.fetch(
        "SELECT * FROM meetings WHERE host_id = $1 ORDER BY created_at DESC LIMIT 20", user["id"])
    out = []
    for r in rows:
        m = dict(r)
        room = rooms.get(m["code"])
        out.append({"code": m["code"], "title": m["title"],
                    "created_at": m["created_at"],
                    "scheduled_at": m.get("scheduled_at"),
                    "waiting_room": m.get("waiting_room", True),
                    "invitees": m.get("invitees", []),
                    "active_participants": len(room["peers"]) if room else 0})
    return out


@api_router.patch("/meetings/{code}")
async def update_meeting(code: str, payload: MeetingUpdate, user: dict = Depends(get_current_user)):
    row = await db.pool.fetchrow("SELECT * FROM meetings WHERE code = $1", code)
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if row["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the host can edit this meeting")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "invitees" in updates:
        updates["invitees"] = [e.strip() for e in updates["invitees"] if e.strip()]
    if "scheduled_at" in updates:
        updates["reminder_30_sent"] = False
        updates["reminder_10_sent"] = False
    if updates:
        cols = list(updates.keys())
        set_clause = ", ".join(f"{c} = ${i + 2}" for i, c in enumerate(cols))
        await db.pool.execute(
            f"UPDATE meetings SET {set_clause} WHERE code = $1",
            code, *[updates[c] for c in cols])
    return {"ok": True, **updates}


@api_router.delete("/meetings/{code}")
async def delete_meeting(code: str, user: dict = Depends(get_current_user)):
    row = await db.pool.fetchrow("SELECT * FROM meetings WHERE code = $1", code)
    if not row:
        raise HTTPException(status_code=404, detail="Meeting not found")
    if row["host_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the host can delete this meeting")
    await db.pool.execute("DELETE FROM meetings WHERE code = $1", code)
    return {"ok": True}


@api_router.post("/cron/reminders")
async def cron_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not secrets.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    asyncio.create_task(process_reminders())
    return {"ok": True}


async def process_reminders():
    now = datetime.now(timezone.utc)
    rows = await db.pool.fetch("SELECT * FROM meetings WHERE scheduled_at IS NOT NULL")
    for r in rows:
        m = dict(r)
        try:
            sched = datetime.fromisoformat(m["scheduled_at"].replace("Z", "+00:00"))
        except Exception:
            continue
        if sched.tzinfo is None:
            sched = sched.replace(tzinfo=timezone.utc)
        if sched < now:
            continue
        mins = (sched - now).total_seconds() / 60.0
        host_email = await db.pool.fetchval("SELECT email FROM users WHERE id = $1", m["host_id"])
        recipients = []
        if host_email:
            recipients.append(host_email)
        recipients += [e for e in m.get("invitees", []) if e]
        recipients = list(dict.fromkeys(recipients))
        if not recipients:
            continue
        join_url = f"{APP_BASE_URL}/j/{m['code']}"

        async def _send(when_label, subject):
            for r in recipients:
                try:
                    await send_email(to=r, subject=subject,
                                     html=build_reminder_html(m["title"], m["host_name"],
                                                              when_label, join_url, m["code"]))
                except Exception as e:
                    logger.error(f"reminder send failed for {r}: {e}")

        if mins <= 30 and not m.get("reminder_30_sent"):
            await _send("30 minutes", f"Reminder: {m['title']} starts soon")
            await db.pool.execute(
                "UPDATE meetings SET reminder_30_sent = TRUE WHERE code = $1", m["code"])
        if mins <= 10 and not m.get("reminder_10_sent"):
            await _send("10 minutes", f"Starting soon: {m['title']}")
            await db.pool.execute(
                "UPDATE meetings SET reminder_10_sent = TRUE WHERE code = $1", m["code"])


@api_router.get("/")
async def root():
    return {"message": "Engraved Word API"}


# ---------------------------------------------------------------------------
# WebRTC signaling (mesh) over WebSocket
# ---------------------------------------------------------------------------
rooms: dict = {}  # code -> {"peers": {...}, "waiting": {...}, "pin": None}


def _new_room():
    return {"peers": {}, "waiting": {}, "pin": None}


def decode_user_id(token: str):
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.InvalidTokenError:
        return None


async def _safe_send(ws: WebSocket, data: dict):
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def broadcast(peers: dict, exclude_id: str, data: dict):
    for pid, p in list(peers.items()):
        if pid != exclude_id:
            await _safe_send(p["ws"], data)


async def broadcast_all(peers: dict, data: dict):
    for p in list(peers.values()):
        await _safe_send(p["ws"], data)


def host_peer_ids(peers: dict):
    return [pid for pid, p in peers.items() if p.get("is_host")]


async def admit_peer(room: dict, peer_id: str):
    w = room["waiting"].pop(peer_id, None)
    if not w:
        return
    peers = room["peers"]
    existing = [{"peerId": pid, "name": p["name"], "audio": p["audio"], "video": p["video"],
                 "isHost": p.get("is_host", False), "handRaised": p.get("hand", False)}
                for pid, p in peers.items()]
    await _safe_send(w["ws"], {"type": "welcome", "peerId": peer_id, "participants": existing,
                              "isHost": w["is_host"], "pin": room["pin"]})
    peers[peer_id] = {"ws": w["ws"], "name": w["name"], "audio": w["audio"],
                      "video": w["video"], "is_host": w["is_host"], "hand": False}
    await broadcast(peers, peer_id, {"type": "peer-joined", "peerId": peer_id, "name": w["name"],
                                     "audio": w["audio"], "video": w["video"], "isHost": w["is_host"]})


@api_router.websocket("/ws/{code}")
async def signaling(websocket: WebSocket, code: str):
    await websocket.accept()
    peer_id = secrets.token_hex(8)
    room = rooms.setdefault(code, _new_room())
    peers = room["peers"]
    name = "Guest"
    try:
        data = await websocket.receive_json()
        if data.get("type") != "join":
            await websocket.close()
            return
        name = data.get("name", "Guest")
        audio = bool(data.get("audio", True))
        video = bool(data.get("video", True))
        user_id = decode_user_id(data.get("token", ""))

        meeting = await db.pool.fetchrow("SELECT * FROM meetings WHERE code = $1", code)
        host_id = meeting["host_id"] if meeting else None
        waiting_enabled = meeting["waiting_room"] if meeting else False
        is_host = bool(user_id and host_id and user_id == host_id)

        room["waiting"][peer_id] = {"ws": websocket, "name": name, "audio": audio,
                                    "video": video, "is_host": is_host}

        if is_host or not waiting_enabled:
            await admit_peer(room, peer_id)
            if is_host:
                for wid, w in list(room["waiting"].items()):
                    await _safe_send(websocket, {"type": "knock", "peerId": wid, "name": w["name"]})
        else:
            await _safe_send(websocket, {"type": "waiting"})
            for hid in host_peer_ids(peers):
                await _safe_send(peers[hid]["ws"], {"type": "knock", "peerId": peer_id, "name": name})

        while True:
            msg = await websocket.receive_json()
            t = msg.get("type")
            sender_is_host = peers.get(peer_id, {}).get("is_host", False)

            if t in ("offer", "answer", "ice"):
                target = peers.get(msg.get("to"))
                if target:
                    await _safe_send(target["ws"], {**msg, "from": peer_id})
            elif t == "chat":
                await broadcast_all(peers, {"type": "chat", "from": peer_id, "name": name,
                                            "text": msg.get("text", ""),
                                            "ts": datetime.now(timezone.utc).isoformat()})
            elif t == "media-state":
                if peer_id in peers:
                    peers[peer_id]["audio"] = bool(msg.get("audio"))
                    peers[peer_id]["video"] = bool(msg.get("video"))
                await broadcast(peers, peer_id, {"type": "media-state", "from": peer_id,
                                                 "audio": msg.get("audio"), "video": msg.get("video")})
            elif t == "raise-hand":
                if peer_id in peers:
                    peers[peer_id]["hand"] = bool(msg.get("raised"))
                await broadcast_all(peers, {"type": "raise-hand", "from": peer_id,
                                            "raised": bool(msg.get("raised"))})
            elif t == "reaction":
                await broadcast_all(peers, {"type": "reaction", "from": peer_id,
                                            "emoji": msg.get("emoji", "")})
            elif t == "admit" and sender_is_host:
                await admit_peer(room, msg.get("peerId"))
            elif t == "deny" and sender_is_host:
                w = room["waiting"].pop(msg.get("peerId"), None)
                if w:
                    await _safe_send(w["ws"], {"type": "denied"})
            elif t == "host-mute" and sender_is_host:
                target = peers.get(msg.get("to"))
                if target:
                    await _safe_send(target["ws"], {"type": "force-mute"})
            elif t == "host-remove" and sender_is_host:
                tid = msg.get("to")
                target = peers.get(tid)
                if target:
                    await _safe_send(target["ws"], {"type": "removed"})
                    peers.pop(tid, None)
                    await broadcast(peers, tid, {"type": "peer-left", "peerId": tid})
            elif t == "pin" and sender_is_host:
                room["pin"] = msg.get("peerId")
                await broadcast_all(peers, {"type": "pin", "peerId": room["pin"]})
            elif t == "lobby-chat":
                text = msg.get("text", "")
                ts = datetime.now(timezone.utc).isoformat()
                to = msg.get("to")
                if to and sender_is_host:
                    w = room["waiting"].get(to)
                    if w:
                        await _safe_send(w["ws"], {"type": "lobby-chat", "from": peer_id,
                                                   "name": name, "text": text, "ts": ts,
                                                   "scope": "from-host"})
                elif not to:
                    wname = room["waiting"].get(peer_id, {}).get("name", name)
                    for hid in host_peer_ids(peers):
                        await _safe_send(peers[hid]["ws"], {"type": "lobby-chat", "from": peer_id,
                                                            "name": wname, "text": text, "ts": ts,
                                                            "scope": "from-guest"})
            elif t == "leave":
                break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.info(f"ws error: {e}")
    finally:
        room["waiting"].pop(peer_id, None)
        if peer_id in peers:
            peers.pop(peer_id, None)
            await broadcast(peers, peer_id, {"type": "peer-left", "peerId": peer_id})
        if not peers and not room["waiting"]:
            rooms.pop(code, None)


# ---------------------------------------------------------------------------
# App wiring
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.connect()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@engravedword.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@123")
    row = await db.pool.fetchrow("SELECT * FROM users WHERE email = $1", admin_email)
    if row is None:
        await db.pool.execute(
            "INSERT INTO users (id, name, email, password_hash, role, created_at) "
            "VALUES ($1, 'Admin', $2, $3, 'admin', $4)",
            uuid.uuid4().hex, admin_email, hash_password(admin_password),
            datetime.now(timezone.utc).isoformat())
    elif not verify_password(admin_password, row["password_hash"]):
        await db.pool.execute(
            "UPDATE users SET password_hash = $1 WHERE email = $2",
            hash_password(admin_password), admin_email)


@app.on_event("shutdown")
async def shutdown_db_client():
    await db.close()
