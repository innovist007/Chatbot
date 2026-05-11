# app/routers/promo_basket.py

"""Promo Basket dashboard endpoints — direct BigQuery, no LLM."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache
from sys import prefix
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.routers.auth import get_current_user
from app.deps import get_agent_service
from app.services.agent_service import AgentService

from app.services.promo_basket_service import (
    PromoBasketFilters,
    PromoBasketService,
)

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

    end = end_date or today
    start = start_date or (end - timedelta(days=30))

    if start > end:
        raise HTTPException(
            status_code=400,
            detail="start_date must be <= end_date",
        )

    compare_mode = compare_mode.lower()

    if compare_mode not in {"dod", "wow", "mom", "yoy"}:
        raise HTTPException(
            status_code=400,
            detail="compare_mode must be one of: dod, wow, mom, yoy",
        )

    return PromoBasketFilters(
        start_date=start,
        end_date=end,
        compare_mode=compare_mode,
    )


@router.get("/overview", summary="Full Promo Basket dashboard payload")
def promo_basket(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    compare_mode: str = Query("mom"),
) -> dict[str, Any]:

    f = _parse_filters(start_date, end_date, compare_mode)

    svc = _service()

    try:
        return {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date": f.end_date.isoformat(),
                "compare_mode": f.compare_mode,
            },

            "overview": svc.overview(f),

            "coupon_performance": svc.coupon_performance(f),

            "basket_distribution": svc.basket_distribution(f),

            "discount_distribution": svc.discount_depth_distribution(f),

            # unavailable sections for current dataset
            "cross_sell_pairs": [],
        }

    except Exception as exc:
        logger.exception("promo_basket dashboard failed")

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Promo Basket query failed: {exc}",
        ) from exc


@router.get("/ai-summary", summary="AI summary of Promo Basket")
def promo_basket_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:

    service = PromoBasketService(settings)

    latest_date = service.get_latest_date()

    if not latest_date:
        return {
            "summary": "No data available",
            "date": None,
        }

    cache_key = f"promo_basket_ai_summary:{latest_date.isoformat()}"

    cached = service._get_cache(cache_key)

    if cached:
        return cached

    prompt = f"""
Generate a brief 3-4 sentence executive summary for PROMO & BASKET performance for {latest_date.isoformat()}.

CRITICAL:
Use ONLY this table:
`innovist-master-data.shopify.products_table`

Focus ONLY on:
- AOV
- coupon usage
- discount depth
- basket size
- top coupon codes

IMPORTANT:
- Do NOT mention RTO
- Do NOT mention cart abandonment
- Do NOT mention BOGO
- Do NOT mention bundle attach
- Do NOT mention recovered carts

Return ONLY plain text.
No SQL.
No bullets.
"""

    try:
        result = agent.ask(prompt)

        answer = result.get(
            "answer",
            "Unable to generate summary",
        )

        response = {
            "summary": answer,
            "date": latest_date.isoformat(),
        }

        service._set_cache(
            cache_key,
            response,
            ttl=86400,
        )

        return response

    except Exception as exc:
        logger.exception("promo basket AI summary failed")

        return {
            "summary": f"Could not generate AI summary: {str(exc)}",
            "date": latest_date.isoformat(),
        }