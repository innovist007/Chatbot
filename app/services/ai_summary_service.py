"""Centralised AI summary service — fire-and-forget generation + SSE delivery.

Two execution paths:
  • /ai-summary  (JSON, backward-compat) — uses FastAPI BackgroundTasks
  • /ai-summary/stream (SSE)             — uses a daemon thread

The daemon-thread path is used for SSE because BackgroundTasks only run
*after* the ASGI response completes, which never happens for a long-lived
SSE stream.  asyncio.ensure_future / create_task are NOT used for generation
because agent.ask() is a blocking synchronous gRPC call that would block
the event loop if awaited, and tasks created inside an async generator can
be silently GC'd before they complete.
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
from typing import Any, AsyncGenerator

from app.services.agent_service import AgentService

logger = logging.getLogger(__name__)

_PENDING     = "__PENDING__"
_PENDING_TTL = 300    # 5 min  — auto-expires so a crash doesn't permanently block
_DONE_TTL    = 86400  # 24 h


# ── Redis helpers (sync, safe to call from any thread) ────────────────────────

def _redis_get(redis_client, key: str) -> Any | None:
    try:
        raw = redis_client.get(key) if redis_client else None
        return json.loads(raw) if raw else None
    except Exception:
        return None


def _redis_set(redis_client, key: str, value: Any, ttl: int) -> None:
    try:
        if redis_client:
            redis_client.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


def _redis_del(redis_client, key: str) -> None:
    try:
        if redis_client:
            redis_client.delete(key)
    except Exception:
        pass


# ── Generation logic (sync — runs in a thread) ────────────────────────────────

def _generate(redis_client, cache_key: str, prompt: str, date_str: str, agent: AgentService) -> None:
    """
    Calls agent.ask() synchronously (blocking gRPC) and writes the result to
    Redis.  Safe to run in any thread; clears PENDING on failure so the next
    request retries rather than hanging.
    """
    try:
        result = agent.ask(prompt)
        data = {
            "status":  "done",
            "summary": result.get("answer") or "Unable to generate summary",
            "date":    date_str,
        }
        _redis_set(redis_client, cache_key, data, _DONE_TTL)
        logger.info("AI summary generated and cached: %s", cache_key)
    except Exception as exc:
        logger.exception("AI summary generation failed for %s: %s", cache_key, exc)
        _redis_del(redis_client, cache_key)   # let next request retry


def _fire_thread(redis_client, cache_key: str, prompt: str, date_str: str, agent: AgentService) -> None:
    """Start a daemon thread to generate the AI summary.

    Daemon threads are guaranteed to run independently of the asyncio event
    loop and will not be cancelled when an SSE generator is GC'd.
    """
    t = threading.Thread(
        target=_generate,
        args=(redis_client, cache_key, prompt, date_str, agent),
        name=f"ai-summary:{cache_key}",
        daemon=True,
    )
    t.start()
    logger.info("AI summary daemon thread started: %s", cache_key)


# ── SSE delivery — holds the connection open, pushes one event when done ──────

async def stream_or_deliver(
    redis_client,
    cache_key: str,
    prompt: str,
    date_str: str,
    agent: AgentService,
) -> AsyncGenerator[dict, None]:
    """
    Async SSE generator.

    • Already done  → yields immediately
    • Already pending (another connection is generating) → waits
    • New           → starts a daemon thread, then waits

    Polls Redis every 1 s, max 120 s.  Yields a timeout error if generation
    doesn't complete in time so the client can show a graceful fallback.
    """
    cached = _redis_get(redis_client, cache_key)

    # ── already done ──────────────────────────────────────────────────────────
    if cached and cached.get("status") == "done":
        yield {"data": json.dumps({"summary": cached["summary"], "date": cached["date"]})}
        return

    # ── trigger generation if not already in flight ───────────────────────────
    if not cached or cached.get("status") != _PENDING:
        _redis_set(redis_client, cache_key, {"status": _PENDING}, _PENDING_TTL)
        _fire_thread(redis_client, cache_key, prompt, date_str, agent)
    else:
        logger.info("AI summary already in-flight, waiting via SSE: %s", cache_key)

    # ── poll every 1 s, max 120 s ─────────────────────────────────────────────
    for _ in range(120):
        await asyncio.sleep(1)
        cached = _redis_get(redis_client, cache_key)
        if cached and cached.get("status") == "done":
            yield {"data": json.dumps({"summary": cached["summary"], "date": cached["date"]})}
            return

    logger.warning("AI summary SSE timed out for: %s", cache_key)
    yield {"data": json.dumps({"error": "timeout", "date": date_str})}
