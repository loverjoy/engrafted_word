"""Backend tests for Engraved Word meeting app (iteration 2).

Covers auth, meetings CRUD (with scheduled_at + waiting_room), and the
WebSocket signaling flows for waiting-room, host-controls, hands & reactions.
"""
import os
import json
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests
import websockets

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if os.environ.get('REACT_APP_BACKEND_URL') else None
if not BASE_URL:
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')

WS_BASE = BASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')

ADMIN_EMAIL = "admin@engravedword.com"
ADMIN_PASSWORD = "Admin@123"


# ------------------------------------------------------------------ fixtures
@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def new_host():
    email = f"test_{uuid.uuid4().hex[:8]}@engravedword.com"
    return {"name": "Test Host", "email": email, "password": "secret123"}


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# --------------------------------------------------------------- Auth tests
def test_register_new_host(s, new_host):
    r = s.post(f"{BASE_URL}/api/auth/register", json=new_host)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data["token"], str) and len(data["token"]) > 10
    assert data["user"]["email"] == new_host["email"].lower()
    new_host["token"] = data["token"]
    new_host["id"] = data["user"]["id"]


def test_register_duplicate(s, new_host):
    r = s.post(f"{BASE_URL}/api/auth/register", json=new_host)
    assert r.status_code == 400


def test_login_admin(admin_token):
    assert len(admin_token) > 10


def test_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_bearer(new_host):
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {new_host['token']}"})
    assert r.status_code == 200


def test_me_unauth():
    assert requests.get(f"{BASE_URL}/api/auth/me").status_code == 401


# ---------------------------------------------------------- Meetings CRUD
def _headers(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_create_meeting_requires_auth():
    r = requests.post(f"{BASE_URL}/api/meetings", json={"title": "x"})
    assert r.status_code == 401


def test_create_meeting_with_schedule_and_waiting_room(admin_token):
    scheduled = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = requests.post(f"{BASE_URL}/api/meetings",
                      headers=_headers(admin_token),
                      json={"title": "TEST_Scheduled", "scheduled_at": scheduled, "waiting_room": True})
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "TEST_Scheduled"
    assert d["waiting_room"] is True
    assert d["scheduled_at"] == scheduled
    assert len(d["code"].split("-")) == 3

    # persisted via GET
    g = requests.get(f"{BASE_URL}/api/meetings/{d['code']}")
    assert g.status_code == 200
    gd = g.json()
    assert gd["waiting_room"] is True
    assert gd["scheduled_at"] == scheduled

    pytest.scheduled_code = d["code"]
    pytest.scheduled_at = scheduled


def test_create_meeting_no_waiting_room(admin_token):
    r = requests.post(f"{BASE_URL}/api/meetings",
                      headers=_headers(admin_token),
                      json={"title": "TEST_Open", "waiting_room": False})
    assert r.status_code == 200
    d = r.json()
    assert d["waiting_room"] is False
    pytest.open_code = d["code"]


def test_create_meeting_waiting_room_true_default(admin_token):
    """Default waiting_room per spec = True."""
    r = requests.post(f"{BASE_URL}/api/meetings",
                      headers=_headers(admin_token), json={"title": "TEST_WR"})
    assert r.status_code == 200
    d = r.json()
    assert d["waiting_room"] is True
    pytest.wr_code = d["code"]


def test_list_meetings_includes_new_fields(admin_token):
    r = requests.get(f"{BASE_URL}/api/meetings", headers=_headers(admin_token))
    assert r.status_code == 200
    lst = r.json()
    codes = [m["code"] for m in lst]
    assert pytest.scheduled_code in codes
    m = next(m for m in lst if m["code"] == pytest.scheduled_code)
    assert "scheduled_at" in m and "waiting_room" in m
    assert m["waiting_room"] is True


def test_patch_meeting_host_only(admin_token, new_host):
    # non-host attempt on admin's meeting -> 403
    r = requests.patch(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}",
                       headers=_headers(new_host["token"]),
                       json={"title": "hijack"})
    assert r.status_code == 403


def test_patch_meeting_ok(admin_token):
    r = requests.patch(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}",
                       headers=_headers(admin_token),
                       json={"title": "TEST_Renamed", "waiting_room": False})
    assert r.status_code == 200
    # verify persisted
    g = requests.get(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}").json()
    assert g["title"] == "TEST_Renamed"
    assert g["waiting_room"] is False


def test_patch_meeting_unknown(admin_token):
    r = requests.patch(f"{BASE_URL}/api/meetings/no-su-ch",
                       headers=_headers(admin_token), json={"title": "x"})
    assert r.status_code == 404


def test_delete_meeting_non_host_forbidden(admin_token, new_host):
    r = requests.delete(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}",
                        headers=_headers(new_host["token"]))
    assert r.status_code == 403


def test_delete_meeting_unknown(admin_token):
    r = requests.delete(f"{BASE_URL}/api/meetings/no-su-ch",
                        headers=_headers(admin_token))
    assert r.status_code == 404


def test_delete_meeting_ok(admin_token):
    r = requests.delete(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}",
                        headers=_headers(admin_token))
    assert r.status_code == 200
    # GET now 404
    assert requests.get(f"{BASE_URL}/api/meetings/{pytest.scheduled_code}").status_code == 404


# ------------------------------------------------------- WebSocket helpers
async def _recv(ws, timeout=5):
    return json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout))


async def _drain(ws, timeout=0.4):
    msgs = []
    try:
        while True:
            msgs.append(json.loads(await asyncio.wait_for(ws.recv(), timeout=timeout)))
    except Exception:
        pass
    return msgs


# -------------------------------------------- WS: no-waiting-room auto-admit
def test_ws_no_waiting_room_auto_admits_guest():
    asyncio.run(_flow_no_wr(pytest.open_code))


async def _flow_no_wr(code):
    url = f"{WS_BASE}/api/ws/{code}"
    async with websockets.connect(url) as ws:
        await ws.send(json.dumps({"type": "join", "name": "Guest", "audio": True, "video": True}))
        m = await _recv(ws)
        assert m["type"] == "welcome"
        assert m["isHost"] is False


# ------------------------------------------ WS: waiting room + host controls
def test_ws_waiting_room_flow_and_host_controls(admin_token):
    asyncio.run(_wr_and_host_flow(pytest.wr_code, admin_token))


async def _wr_and_host_flow(code, admin_token):
    url = f"{WS_BASE}/api/ws/{code}"
    async with websockets.connect(url) as host_ws:
        # Host joins with token -> isHost true, immediate welcome
        await host_ws.send(json.dumps({"type": "join", "name": "Host",
                                       "audio": True, "video": True, "token": admin_token}))
        m = await _recv(host_ws)
        assert m["type"] == "welcome"
        assert m["isHost"] is True

        # Guest B joins without token -> should get "waiting"; host gets "knock"
        async with websockets.connect(url) as guest_ws:
            await guest_ws.send(json.dumps({"type": "join", "name": "Bob",
                                            "audio": True, "video": True}))
            gm = await _recv(guest_ws)
            assert gm["type"] == "waiting"
            hm = await _recv(host_ws)
            assert hm["type"] == "knock"
            assert hm["name"] == "Bob"
            guest_peer_id = hm["peerId"]

            # Non-host cannot admit itself (send admit with fake id) - ignored
            await guest_ws.send(json.dumps({"type": "admit", "peerId": guest_peer_id}))
            # no message expected -> drain
            leftover = await _drain(guest_ws)
            assert all(x["type"] != "welcome" for x in leftover)

            # Host admits
            await host_ws.send(json.dumps({"type": "admit", "peerId": guest_peer_id}))
            # Guest -> welcome; host -> peer-joined
            gm2 = await _recv(guest_ws)
            assert gm2["type"] == "welcome"
            hm2 = await _recv(host_ws)
            assert hm2["type"] == "peer-joined"
            assert hm2["peerId"] == guest_peer_id

            # host-mute
            await host_ws.send(json.dumps({"type": "host-mute", "to": guest_peer_id}))
            gm3 = await _recv(guest_ws)
            assert gm3["type"] == "force-mute"

            # pin -> all receive
            await host_ws.send(json.dumps({"type": "pin", "peerId": guest_peer_id}))
            # Both should receive
            h_pin = await _recv(host_ws)
            g_pin = await _recv(guest_ws)
            assert h_pin["type"] == "pin" and h_pin["peerId"] == guest_peer_id
            assert g_pin["type"] == "pin"

            # non-host attempts host-mute / pin / host-remove -> ignored
            await guest_ws.send(json.dumps({"type": "host-mute", "to": guest_peer_id}))
            await guest_ws.send(json.dumps({"type": "pin", "peerId": "xxx"}))
            await guest_ws.send(json.dumps({"type": "host-remove", "to": guest_peer_id}))
            leftover = await _drain(host_ws, timeout=0.5)
            # no pin/force-mute/removed/peer-left messages should have come through
            assert not any(x["type"] in ("force-mute", "removed") for x in leftover)
            # (pin could echo if server broadcasted, but guest is not host so it must not)
            assert not any(x["type"] == "pin" for x in leftover)

            # raise-hand broadcast (from guest)
            await guest_ws.send(json.dumps({"type": "raise-hand", "raised": True}))
            h_hand = await _recv(host_ws)
            g_hand = await _recv(guest_ws)
            assert h_hand["type"] == "raise-hand" and h_hand["raised"] is True
            assert g_hand["type"] == "raise-hand"

            # reaction broadcast
            await guest_ws.send(json.dumps({"type": "reaction", "emoji": "🎉"}))
            h_rx = await _recv(host_ws)
            g_rx = await _recv(guest_ws)
            assert h_rx["type"] == "reaction" and h_rx["emoji"] == "🎉"
            assert g_rx["type"] == "reaction"

            # host-remove
            await host_ws.send(json.dumps({"type": "host-remove", "to": guest_peer_id}))
            g_rm = await _recv(guest_ws)
            assert g_rm["type"] == "removed"
            # Host (as other peer) receives peer-left per spec
            h_left = await _recv(host_ws)
            assert h_left["type"] == "peer-left" and h_left["peerId"] == guest_peer_id


# ---------------------------------------------- WS: deny flow
def test_ws_waiting_room_deny(admin_token):
    asyncio.run(_deny_flow(admin_token))


async def _deny_flow(admin_token):
    # Create a fresh WR meeting
    r = requests.post(f"{BASE_URL}/api/meetings",
                      headers=_headers(admin_token),
                      json={"title": "TEST_Deny", "waiting_room": True})
    code = r.json()["code"]
    url = f"{WS_BASE}/api/ws/{code}"
    async with websockets.connect(url) as host_ws:
        await host_ws.send(json.dumps({"type": "join", "name": "H",
                                       "audio": True, "video": True, "token": admin_token}))
        assert (await _recv(host_ws))["type"] == "welcome"

        async with websockets.connect(url) as guest_ws:
            await guest_ws.send(json.dumps({"type": "join", "name": "G",
                                            "audio": True, "video": True}))
            assert (await _recv(guest_ws))["type"] == "waiting"
            knock = await _recv(host_ws)
            assert knock["type"] == "knock"
            await host_ws.send(json.dumps({"type": "deny", "peerId": knock["peerId"]}))
            denied = await _recv(guest_ws)
            assert denied["type"] == "denied"

    # cleanup
    requests.delete(f"{BASE_URL}/api/meetings/{code}", headers=_headers(admin_token))


# ------------------------------------- teardown: delete leftover test meetings
def test_cleanup(admin_token):
    for code_attr in ("open_code", "wr_code"):
        code = getattr(pytest, code_attr, None)
        if code:
            requests.delete(f"{BASE_URL}/api/meetings/{code}", headers=_headers(admin_token))
