"""Internal endpoints — not exposed in API docs, protected by CRON_SECRET_KEY.

Called by Cloud Scheduler at the configured time (SUMMARY_CRON_SCHEDULE).
Pre-generates all AI summaries and writes them to Redis so every user
gets an instant cache hit when they open the dashboard.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta, timezone
from functools import lru_cache
from typing import Any

IST = timezone(timedelta(hours=5, minutes=30))

import redis as redis_lib
from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.deps import get_agent_service
from app.services.ai_summary_service import _generate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/internal", include_in_schema=False)


@lru_cache
def _redis():
    s = get_settings()
    try:
        client = redis_lib.Redis(
            host=s.redis_host, port=s.redis_port, db=0,
            decode_responses=True, socket_connect_timeout=2,
        )
        client.ping()
        return client
    except Exception:
        return None


def _all_summaries(today: str, data_date: str | None = None) -> list[dict[str, Any]]:
    data_date = data_date or today  # fall back to today if called directly
    """Return all (cache_key, prompt, date_str) tuples for every module."""
    from app.modules.retention.router    import _retention_prompt
    from app.modules.web_cr.router       import _web_cr_prompt
    from app.modules.supply_chain.router import _sc_prompt
    from app.modules.acquisition.router  import _acquisition_ai_prompt
    from app.modules.d2c_overview.router import _build_overview_prompt
    from app.modules.d2c_rto.router      import _rto_prompt
    from app.modules.promo_basket.router import _promo_prompt

    rc = _redis()

    return [
        {
            "module":     "retention",
            "cache_key":  f"retention:ai_summary:{today}",
            "prompt":     _retention_prompt(data_date),
        },
        {
            "module":     "webcr",
            "cache_key":  f"webcr:ai_summary:{today}",
            "prompt":     _web_cr_prompt(data_date),
        },
        {
            "module":     "appcr",
            "cache_key":  f"appcr:ai_summary:{today}",
            "prompt":     f"Generate a 3-4 sentence executive summary of mobile app performance for {data_date}. "
                          "Use data from: innovist-master-data.appsflyer_transformed.appsflyer_data_table_session "
                          "Focus on installs, CVR, revenue, and top channel. Return plain text only.",
        },
        {
            "module":     "sc",
            "cache_key":  f"sc:ai_summary:{today}",
            "prompt":     _sc_prompt(data_date),
        },
        {
            "module":     "acquisition",
            "cache_key":  f"acquisition:ai_summary:{today}",
            "prompt":     _acquisition_ai_prompt(data_date),
        },
        {
            "module":     "d2c_overview",
            "cache_key":  f"d2c_overview:ai_summary:{today}",
            # data_date = day described (yesterday); today = slot peers are stored under
            "prompt":     _build_overview_prompt(rc, data_date, today),
        },
        {
            "module":     "d2crto",
            "cache_key":  f"d2crto:ai_summary:{today}",
            "prompt":     _rto_prompt(data_date),
        },
        {
            "module":     "promo",
            "cache_key":  f"promo:ai_summary:{today}",
            "prompt":     _promo_prompt(data_date),
        },
    ]


@router.get("/warm-summaries")
async def warm_summaries(
    x_cron_key: str | None = Header(None),
) -> dict[str, Any]:
    """
    Pre-generate all AI summaries for today. Called by Cloud Scheduler.
    Protected by X-Cron-Key header — must match CRON_SECRET_KEY env var.
    """
    settings = get_settings()
    if not settings.cron_secret_key or x_cron_key != settings.cron_secret_key:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Use IST for both dates — cron runs at 9:30 AM IST
    from datetime import datetime as _dt
    ist_now   = _dt.now(IST)
    today     = ist_now.date().isoformat()           # Jun 9 — cache key (dashboard looks up today)
    data_date = (ist_now.date() - timedelta(days=1)).isoformat()  # Jun 8 — data in prompts

    agent  = get_agent_service()
    rc     = _redis()
    items  = _all_summaries(today, data_date)

    results: dict[str, str] = {}

    async def _run_one(item: dict) -> None:
        module    = item["module"]
        cache_key = item["cache_key"]
        prompt    = item["prompt"]
        try:
            # store the data_date (yesterday) as the displayed date — the slot
            # (today) is only the cache key, matched by the on-demand endpoints
            await asyncio.to_thread(_generate, rc, cache_key, prompt, data_date, agent)
            results[module] = "ok"
            logger.info("warm-summaries: %s done", module)
        except Exception as exc:
            results[module] = f"error: {exc}"
            logger.error("warm-summaries: %s failed — %s", module, exc)

    await asyncio.gather(*[_run_one(item) for item in items])

    all_ok = all(v == "ok" for v in results.values())
    logger.info("warm-summaries complete: %s", results)
    return {
        "date":    today,
        "status":  "ok" if all_ok else "partial",
        "modules": results,
    }
