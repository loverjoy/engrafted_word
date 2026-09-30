import os
import asyncpg

pool: asyncpg.Pool | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'host',
    created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meetings (
    code             TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    host_id          TEXT NOT NULL,
    host_name        TEXT NOT NULL,
    scheduled_at     TEXT,
    waiting_room     BOOLEAN NOT NULL DEFAULT TRUE,
    invitees         TEXT[]  NOT NULL DEFAULT '{}',
    reminder_30_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_10_sent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS meetings_host_id_idx ON meetings (host_id);
"""


def _clean_dsn(dsn: str) -> str:
    if "?" not in dsn:
        return dsn
    base, qs = dsn.split("?", 1)
    params = []
    for p in qs.split("&"):
        if not p or p.startswith("channel_binding="):
            continue
        if p.startswith("sslmode="):
            p = "sslmode=require"
        params.append(p)
    return f"{base}?{'&'.join(params)}" if params else base


async def connect() -> None:
    global pool
    dsn = os.environ["DATABASE_URL"].strip()
    kwargs = {}
    if "sslmode=" not in dsn:
        kwargs["ssl"] = "require"
    pool = await asyncpg.create_pool(dsn=_clean_dsn(dsn), min_size=1, max_size=5, **kwargs)
    async with pool.acquire() as conn:
        await conn.execute(SCHEMA)


async def close() -> None:
    global pool
    if pool is not None:
        await pool.close()
        pool = None
