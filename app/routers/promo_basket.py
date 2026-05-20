"""Promo Basket dashboard endpoints."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.deps import get_agent_service
from app.routers.auth import get_current_user
from app.services.agent_service import AgentService
from app.services.promo_basket_service import PromoBasketFilters, PromoBasketService

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
    start_date: date | None,
    end_date: date | None,
    compare_mode: str,
) -> PromoBasketFilters:
    today = date.today()
    end   = end_date   or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    compare_mode = compare_mode.lower()
    if compare_mode not in {"dod", "wow", "mom", "yoy"}:
        raise HTTPException(status_code=400, detail="compare_mode must be one of: dod, wow, mom, yoy")
    return PromoBasketFilters(start_date=start, end_date=end, compare_mode=compare_mode)


@router.get("/overview", summary="Full Promo Basket dashboard payload")
async def promo_basket(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    compare_mode: str = Query("mom"),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, compare_mode)
    svc = _service()
    try:
        overview, coupon_performance, basket_distribution, discount_distribution = await asyncio.gather(
            asyncio.to_thread(svc.overview, f),
            asyncio.to_thread(svc.coupon_performance, f),
            asyncio.to_thread(svc.basket_distribution, f),
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


@router.get("/ai-summary", summary="AI summary of Promo Basket")
async def promo_basket_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    service = _service()

    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        return {"summary": "No data available", "date": None}

    cache_key = f"promo_basket_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached

    prompt = f"""Generate a brief 3-4 sentence executive summary for PROMO & BASKET performance for {latest_date.isoformat()}.
Use ONLY: `innovist-master-data.shopify.products_table`
Focus on AOV, coupon usage, discount depth, basket size, top coupon codes.
Return ONLY plain text, no SQL, no bullets."""

    try:
        result = await asyncio.to_thread(agent.ask, prompt)
        response = {"summary": result.get("answer", "Unable to generate summary"), "date": latest_date.isoformat()}
        service._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("Promo basket AI summary failed")
        return {"summary": f"Could not generate AI summary: {exc}", "date": latest_date.isoformat()}
