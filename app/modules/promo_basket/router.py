"""Promo Basket dashboard endpoints."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.promo_basket.service import PromoBasketFilters, PromoBasketService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/promo",
    tags=["promo"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> PromoBasketService:
    return PromoBasketService(get_settings())


def _parse_filters(
    start_date:    date | None,
    end_date:      date | None,
    compare_mode:  str,
    compare_start: date | None = None,
    compare_end:   date | None = None,
) -> PromoBasketFilters:
    today = date.today()
    end   = end_date   or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return PromoBasketFilters(
        start_date=start, end_date=end,
        compare_mode=compare_mode.lower(),
        compare_start=compare_start, compare_end=compare_end,
    )


@router.get("/overview", summary="Full Promo Basket dashboard payload")
async def promo_basket(
    start_date:    date | None = Query(None),
    end_date:      date | None = Query(None),
    compare_mode:  str         = Query("mom"),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, compare_mode, compare_start, compare_end)
    svc = _service()
    try:
        overview, coupon_performance, basket_distribution, discount_distribution = await asyncio.gather(
            asyncio.to_thread(svc.overview,                   f),
            asyncio.to_thread(svc.coupon_performance,         f),
            asyncio.to_thread(svc.basket_distribution,        f),
            asyncio.to_thread(svc.discount_depth_distribution, f),
        )
        return {
            "filters": {
                "start_date":   f.start_date.isoformat(),
                "end_date":     f.end_date.isoformat(),
                "compare_mode": f.compare_mode,
            },
            "overview":              overview,
            "coupon_performance":    coupon_performance,
            "basket_distribution":   basket_distribution,
            "discount_distribution": discount_distribution,
            "cross_sell_pairs":      [],
        }
    except Exception as exc:
        logger.exception("promo_basket dashboard failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Promo Basket query failed: {exc}") from exc


@router.get("/ai-summary/stream", summary="AI summary — SSE stream. Pushes one JSON event when ready.")
async def promo_basket_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    service     = _service()
    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        async def _no_data():
            import json
            yield {"data": json.dumps({"summary": "No data available", "date": None})}
        return EventSourceResponse(_no_data(), headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})
    slot, data_date = ai_summary_dates()   # key on today (matches cron), display yesterday
    cache_key    = f"promo:ai_summary:{slot}"
    redis_client = service.redis_client if service.cache_enabled else None
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, _promo_prompt(data_date), data_date, agent),
    )


def _promo_prompt(as_of: str) -> str:
    return f"""Generate a brief 3-4 sentence executive summary for PROMO & BASKET performance for {as_of}.
Use ONLY: `innovist-master-data.shopify.products_table`
Focus on AOV, coupon usage, discount depth, basket size, top coupon codes.
Return ONLY plain text, no SQL, no bullets."""
