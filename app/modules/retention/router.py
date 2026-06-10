from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from functools import lru_cache

IST = timezone(timedelta(hours=5, minutes=30))

import redis
from fastapi import APIRouter, Depends

from app.config import get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.retention.tabs.overview.router import router as overview_router
from app.modules.retention.tabs.trend.router import router as trend_router
from app.modules.retention.tabs.product.router import router as product_router
from app.modules.retention.tabs.acquisition_quality.router import router as acquisition_quality_router
from app.modules.retention.tabs.unit_economics.router import router as unit_economics_router

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/retention",
    tags=["retention"],
    dependencies=[Depends(get_current_user)],
)

router.include_router(overview_router)
router.include_router(trend_router)
router.include_router(product_router)
router.include_router(acquisition_quality_router)
router.include_router(unit_economics_router)


# ── Shared helpers ────────────────────────────────────────────────────────────

@lru_cache
def _redis_client():
    settings = get_settings()
    try:
        client = redis.Redis(
            host=settings.redis_host, port=settings.redis_port, db=0,
            decode_responses=True, socket_connect_timeout=2,
        )
        client.ping()
        return client
    except Exception:
        return None


def _retention_prompt(as_of: str) -> str:
    return (
        f"Generate a 3–4 sentence executive summary of repeat and retention performance for {as_of}. "
        "Focus on: 30-day repeat rate, LTV vs CAC, top-repeating product/brand, and one actionable recommendation. "
        "Return plain text only — no bullets, no markdown."
    )


# ── AI Summary endpoints ──────────────────────────────────────────────────────

@router.get("/ai-summary/stream", summary="AI summary — SSE stream")
async def retention_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    # Match the warm-summaries cron exactly: the cache slot is keyed on today
    # (IST), but the summary content is for the previous day — the latest
    # complete data. This keeps the on-demand result identical to the cron's,
    # so an early-morning visit (before the cron) no longer caches a summary
    # about today's incomplete data.
    ist_today = datetime.now(IST).date()
    slot      = ist_today.isoformat()
    data_date = (ist_today - timedelta(days=1)).isoformat()
    cache_key = f"retention:ai_summary:{slot}"
    return EventSourceResponse(
        stream_or_deliver(_redis_client(), cache_key, _retention_prompt(data_date), data_date, agent),
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
