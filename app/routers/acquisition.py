"""Acquisition (Meta Ads) dashboard endpoints."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import Settings, get_settings
from app.routers.auth import get_current_user
from app.services.meta_ads_service import MetaAdsFilters, MetaAdsService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/acquisition",
    tags=["acquisition"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> MetaAdsService:
    return MetaAdsService(get_settings())


def _parse_filters(
    start_date: date | None,
    end_date: date | None,
    campaigns: list[str] | None,
    stages: list[str] | None,
    creative_types: list[str] | None,
    brands: list[str] | None,
    languages: list[str] | None,
    ad_names: list[str] | None,
) -> MetaAdsFilters:
    today = date.today()
    end = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return MetaAdsFilters(
        start_date=start, end_date=end,
        campaigns=campaigns, stages=stages,
        creative_types=creative_types, brands=brands,
        languages=languages, ad_names=ad_names,
    )


# ------------------------------------------------------------------ Overview (KPIs + stage + creative + funnel)
@router.get("/overview", summary="KPIs, stage breakdown, creative table, funnel CVR")
async def overview(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        kpis, stage_breakdown, creative_table, funnel_cvr, fatigued_ads = await asyncio.gather(
            asyncio.to_thread(svc.kpis, f),
            asyncio.to_thread(svc.stage_breakdown, f),
            asyncio.to_thread(svc.creative_table, f),
            asyncio.to_thread(svc.funnel_cvr, f),
            asyncio.to_thread(svc.fatigued_ads, f),
        )
        return {
            "filters": {"start_date": f.start_date.isoformat(), "end_date": f.end_date.isoformat()},
            "kpis": kpis,
            "stage_breakdown": stage_breakdown,
            "creative_table": creative_table,
            "funnel_cvr": funnel_cvr,
            "fatigued_ads": fatigued_ads,
        }
    except Exception as exc:
        logger.exception("acquisition overview failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Trend (granularity-aware)
@router.get("/trend", summary="Daily/weekly/monthly spend + all metrics")
async def trend(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    granularity: str = Query("day", description="day | week | month"),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.daily_trend, f, granularity)
    except Exception as exc:
        logger.exception("acquisition trend failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Performance table (campaign / ad level)
@router.get("/table", summary="Performance table — campaign or ad level with period delta")
async def table(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    level: str = Query("campaign", description="campaign | ad"),
    compare_mode: str = Query("MoM", description="DoD | WoW | MoM"),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.campaign_table, f, level, compare_mode)
    except Exception as exc:
        logger.exception("acquisition table failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Filter options
@router.get("/filter-options", summary="Distinct filter values for dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:
        logger.exception("acquisition filter_options failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
