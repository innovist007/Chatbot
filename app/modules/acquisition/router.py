from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache

import redis
from fastapi import APIRouter, Depends, Query

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.acquisition.tabs.meta_ads.router import router as meta_ads_router
from app.modules.acquisition.tabs.partnership.router import router as partnership_router

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/acquisition",
    tags=["acquisition"],
    dependencies=[Depends(get_current_user)],
)

router.include_router(meta_ads_router)
router.include_router(partnership_router)


# ─────────────────────────────────────────────────────────────────
# AI Summary (lives at module level)
# ─────────────────────────────────────────────────────────────────

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


def _acquisition_ai_prompt(as_of: str) -> str:
    return f"""Generate a brief 4-5 sentence executive summary of Meta Ads acquisition performance for the period ending {as_of}.

CRITICAL: Use data from BOTH of these tables:
1. `innovist-master-data.shopify.v_meta_spends_table`  — ad spend, ROAS, CM1/CM2, CTR, CPM, creative performance
2. `innovist-master-data.shopify.v_fb_pincode_table`   — geographic order distribution, RTO by location, COD vs prepaid split

Focus on:
- Total spend and ROAS (both Shopify/delivered and Meta-claimed)
- CM1 and CM2 margin health (CM2 = CM1 - Spends)
- Top-performing campaign or creative type (CPM, CTR trends)
- Geographic hotspots: top cities/pincodes by orders and worst RTO locations
- COD vs prepaid share and what it implies for RTO risk

IMPORTANT RULES:
- 4-5 sentences plain text only
- No charts, no SQL, no tables, no bullet points
- Mention specific numbers, city names, and percentages
- Data as of {as_of} (yesterday — pipeline closed)"""


@router.get("/ai-summary/stream", summary="AI summary — SSE stream. Pushes one JSON event when ready.")
async def ai_summary_stream(
    end_date: date | None  = Query(None),
    agent:    AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    slot, data_date = ai_summary_dates()
    if end_date:
        # custom date view → its own key (not pre-warmed by the cron)
        as_of = min(end_date, date.today() - timedelta(days=1)).isoformat()
        cache_key = f"acquisition:ai_summary:{as_of}"
    else:
        # default view → key on today's slot so it hits the warm-summaries cron
        as_of = data_date
        cache_key = f"acquisition:ai_summary:{slot}"
    return EventSourceResponse(
        stream_or_deliver(_redis_client(), cache_key, _acquisition_ai_prompt(as_of), as_of, agent),
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
