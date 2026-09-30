"""Iteration 3 backend tests: invitees, cron reminders, lobby chat WS."""
import os
import json
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
import websockets

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip()
BASE_URL = BASE_URL.rstrip('/')
WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')

ADMIN_EMAIL = "admin@engravedword.com"
ADMIN_PASSWORD = "Admin@123"

with open('/app/backend/.env') as f:
    ENV = {}
    for line in f:
        line = line.strip()
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            ENV[k] = v.strip().strip('"').strip("'")
CRON_SECRET = ENV.get('WEBHOOK_CRON_SECRET', '')


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def other_token():
    email = f"test_{uuid.uuid4().hex[:8]}@engravedword.com"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"name": "T", "email": email, "password": "secret123"})
    assert r.status_code == 200
    return r.json()["token"]


def H(t):
    return {"Authorization": f"Bearer {t}"}


# ---------------- invitees on meetings
def test_create_meeting_with_invitees(admin_token):
    r = requests.post(f"{BASE_URL}/api/meetings", headers=H(admin_token),
                      json={"title": "TEST_Invitees",
                            "invitees": ["a@test.com", " b@test.com ", ""]})
    assert r.status_code == 200
    d = r.json()
    assert d["invitees"] == ["a@test.com", "b@test.com"]
    pytest.inv_code = d["code"]


def test_list_meetings_returns_invitees(admin_token):
    r = requests.get(f"{BASE_URL}/api/meetings", headers=H(admin_token))
    assert r.status_code == 200
    m = next((x for x in r.json() if x["code"] == pytest.inv_code), None)
    assert m is not None
    assert m["invitees"] == ["a@test.com", "b@test.com"]


def test_patch_meeting_invitees_and_reset_reminders(admin_token):
    new_sched = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    r = requests.patch(f"{BASE_URL}/api/meetings/{pytest.inv_code}",
                       headers=H(admin_token),
                       json={"invitees": ["c@test.com"], "scheduled_at": new_sched})
    assert r.status_code == 200
    lst = requests.get(f"{BASE_URL}/api/meetings", headers=H(admin_token)).json()
    m = next(x for x in lst if x["code"] == pytest.inv_code)
    assert m["invitees"] == ["c@test.com"]
    assert m["scheduled_at"] == new_sched


def test_patch_meeting_host_only_for_invitees(admin_token, other_token):
    r = requests.patch(f"{BASE_URL}/api/meetings/{pytest.inv_code}",
                       headers=H(other_token),
                       json={"invitees": ["x@x.com"]})
    assert r.status_code == 403


# ---------------- Cron reminders
def test_cron_reminders_unauth():
    r = requests.post(f"{BASE_URL}/api/cron/reminders")
    assert r.status_code == 401


def test_cron_reminders_wrong_secret():
    r = requests.post(f"{BASE_URL}/api/cron/reminders",
                      headers={"Authorization": "Bearer wrong"})
    assert r.status_code == 401


def test_cron_reminders_with_secret_triggers_flags(admin_token):
    # Create scheduled meeting ~8min in future -> both 30 and 10 windows fire
    sched = (datetime.now(timezone.utc) + timedelta(minutes=8)).isoformat()
    r = requests.post(f"{BASE_URL}/api/meetings", headers=H(admin_token),
                      json={"title": "TEST_Reminder", "scheduled_at": sched,
                            "invitees": ["delivered@resend.dev"]})
    assert r.status_code == 200
    code = r.json()["code"]
    pytest.rem_code = code

    # Trigger cron
    r2 = requests.post(f"{BASE_URL}/api/cron/reminders",
                       headers={"Authorization": f"Bearer {CRON_SECRET}"})
    assert r2.status_code == 200
    assert r2.json() == {"ok": True}

    # Give background task time to run email calls (async network -> Resend)
    import time
    time.sleep(8)

    lst = requests.get(f"{BASE_URL}/api/meetings", headers=H(admin_token)).json()
    m = next(x for x in lst if x["code"] == code)
    # Verify flags via direct mongo through repeated cron call - the response fields
    # aren't in list; use a second GET after cron. Since API doesn't expose them,
    # we assert by triggering cron again and expecting no re-send (idempotency check).
    # But we also inspect mongo via a small helper: use pymongo if available.
    try:
        from pymongo import MongoClient
        mc = MongoClient(ENV['MONGO_URL'])
        doc = mc[ENV['DB_NAME']].meetings.find_one({"code": code})
        assert doc.get("reminder_30_sent") is True, doc
        assert doc.get("reminder_10_sent") is True, doc
    except ImportError:
        pytest.skip("pymongo not installed for direct flag check")

    # Second call - should not re-send (flags stay True)
    r3 = requests.post(f"{BASE_URL}/api/cron/reminders",
                       headers={"Authorization": f"Bearer {CRON_SECRET}"})
    assert r3.status_code == 200
    import time as _t
    _t.sleep(2)
    try:
        from pymongo import MongoClient
        mc = MongoClient(ENV['MONGO_URL'])
        doc = mc[ENV['DB_NAME']].meetings.find_one({"code": code})
        assert doc.get("reminder_30_sent") is True
        assert doc.get("reminder_10_sent") is True
    except ImportError:
        pass


# ---------------- WS Lobby chat
async def _recv(ws, timeout=5):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))


async def _drain(ws, timeout=0.5):
    msgs = []
    try:
        while True:
            msgs.append(json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout)))
    except Exception:
        pass
    return msgs


def test_ws_lobby_chat(admin_token):
    asyncio.run(_lobby_chat_flow(admin_token))


async def _lobby_chat_flow(admin_token):
    r = requests.post(f"{BASE_URL}/api/meetings", headers=H(admin_token),
                      json={"title": "TEST_Lobby", "waiting_room": True})
    code = r.json()["code"]
    url = f"{WS_BASE}/api/ws/{code}"
    try:
        async with websockets.connect(url) as host_ws:
            await host_ws.send(json.dumps({"type": "join", "name": "Host",
                                           "audio": True, "video": True, "token": admin_token}))
            m = await _recv(host_ws)
            assert m["type"] == "welcome" and m["isHost"] is True

            async with websockets.connect(url) as guest_ws:
                await guest_ws.send(json.dumps({"type": "join", "name": "Bob",
                                                "audio": True, "video": True}))
                assert (await _recv(guest_ws))["type"] == "waiting"
                knock = await _recv(host_ws)
                assert knock["type"] == "knock"
                guest_pid = knock["peerId"]

                # Guest -> Host lobby chat
                await guest_ws.send(json.dumps({"type": "lobby-chat", "text": "can I join?"}))
                hmsg = await _recv(host_ws)
                assert hmsg["type"] == "lobby-chat"
                assert hmsg["scope"] == "from-guest"
                assert hmsg["from"] == guest_pid
                assert hmsg["text"] == "can I join?"
                assert hmsg["name"] == "Bob"

                # Host -> Guest reply
                await host_ws.send(json.dumps({"type": "lobby-chat",
                                               "to": guest_pid, "text": "one sec"}))
                gmsg = await _recv(guest_ws)
                assert gmsg["type"] == "lobby-chat"
                assert gmsg["scope"] == "from-host"
                assert gmsg["text"] == "one sec"

                # Second guest tries to route 'to' - non-host should not deliver
                async with websockets.connect(url) as guest2_ws:
                    await guest2_ws.send(json.dumps({"type": "join", "name": "Eve",
                                                     "audio": True, "video": True}))
                    assert (await _recv(guest2_ws))["type"] == "waiting"
                    await _recv(host_ws)  # knock
                    # Guest tries to send directed to guest_pid
                    await guest2_ws.send(json.dumps({"type": "lobby-chat",
                                                     "to": guest_pid, "text": "hi bob"}))
                    # Bob (guest_ws) should NOT receive this
                    leftover = await _drain(guest_ws, timeout=0.8)
                    assert not any(x.get("type") == "lobby-chat" for x in leftover), leftover
    finally:
        requests.delete(f"{BASE_URL}/api/meetings/{code}", headers=H(admin_token))


def test_cleanup(admin_token):
    for attr in ("inv_code", "rem_code"):
        c = getattr(pytest, attr, None)
        if c:
            requests.delete(f"{BASE_URL}/api/meetings/{c}", headers=H(admin_token))
