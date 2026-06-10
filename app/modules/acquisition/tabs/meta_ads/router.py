from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status

from app.config import get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.acquisition.tabs.meta_ads.filters import MetaAdsFilters
from app.modules.acquisition.tabs.meta_ads.service import MetaAdsService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _service() -> MetaAdsService:
    return MetaAdsService(get_settings())


def _parse_filters(
    start_date:     date | None,
    end_date:       date | None,
    campaigns:      list[str] | None,
    stages:         list[str] | None,
    creative_types: list[str] | None,
    brands:         list[str] | None,
    languages:      list[str] | None,
    ad_names:       list[str] | None,
    adset_names:    list[str] | None = None,
    compare_start:  date | None = None,
    compare_end:    date | None = None,
) -> MetaAdsFilters:
    today = date.today()
    end   = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return MetaAdsFilters(
        start_date=start, end_date=end,
        campaigns=campaigns, stages=stages,
        creative_types=creative_types, brands=brands,
        languages=languages, ad_names=ad_names,
        adset_names=adset_names,
        compare_start=compare_start, compare_end=compare_end,
    )


@router.get("/overview", summary="KPIs, diagnostic funnel, stage/creative breakdown, fatigued ads")
async def overview(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    compare_start:  date | None      = Query(None),
    compare_end:    date | None      = Query(None),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                         adset_names=adset_names, compare_start=compare_start, compare_end=compare_end)
    svc = _service()
    try:
        kpis, stage_breakdown, creative_table, fatigued_ads = await asyncio.gather(
            asyncio.to_thread(svc.kpis,            f),
            asyncio.to_thread(svc.stage_breakdown, f),
            asyncio.to_thread(svc.creative_table,  f),
            asyncio.to_thread(svc.fatigued_ads,    f),
        )
        return {
            "filters":         {"start_date": f.start_date.isoformat(), "end_date": f.end_date.isoformat()},
            "kpis":            kpis,
            "stage_breakdown": stage_breakdown,
            "creative_table":  creative_table,
            "fatigued_ads":    fatigued_ads,
        }
    except Exception as exc:
        logger.exception("acquisition overview failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/waterfall", summary="P&L waterfall — Shopify / Meta / GA4 source comparison")
async def waterfall(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                       adset_names=adset_names)
    try:
        return await asyncio.to_thread(_service().waterfall, f)
    except Exception as exc:
        logger.exception("acquisition waterfall failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/trend", summary="Daily/weekly/monthly spend + all metrics")
async def trend(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    granularity:    str              = Query("day", description="day | week | month"),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                       adset_names=adset_names)
    try:
        return await asyncio.to_thread(_service().daily_trend, f, granularity)
    except Exception as exc:
        logger.exception("acquisition trend failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/table", summary="Performance table — full P&L per campaign, adset or ad")
async def table(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    level:          str              = Query("campaign", description="campaign | adset | ad"),
    compare_mode:   str              = Query("MoM",     description="DoD | WoW | MoM"),
    compare_start:  date | None      = Query(None),
    compare_end:    date | None      = Query(None),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                       adset_names=adset_names)
    try:
        return await asyncio.to_thread(_service().campaign_table, f, level, compare_mode, compare_start, compare_end)
    except Exception as exc:
        logger.exception("acquisition table failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/pivot-table", summary="Pivot — brand / creative_type / language breakdown")
async def pivot_table(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    pivot_by:       str              = Query("brand", description="brand | creative_type | language | brand_creative | full"),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                       adset_names=adset_names)
    try:
        return await asyncio.to_thread(_service().pivot_table, f, pivot_by)
    except Exception as exc:
        logger.exception("acquisition pivot-table failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/gainers-decliners", summary="Top 10 gainers and decliners vs prior period")
async def gainers_decliners(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    compare_start:  date | None      = Query(None),
    compare_end:    date | None      = Query(None),
    level:          str              = Query("campaign", description="campaign | adset | ad"),
    sort_by:        str              = Query("roas_delta", description="roas_delta | rev_delta | roas_delta_pct"),
    campaigns:      list[str] | None = Query(None),
    stages:         list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands:         list[str] | None = Query(None),
    languages:      list[str] | None = Query(None),
    ad_names:       list[str] | None = Query(None),
    adset_names:    list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                       adset_names=adset_names, compare_start=compare_start, compare_end=compare_end)
    try:
        return await asyncio.to_thread(_service().gainers_decliners, f, level, sort_by)
    except Exception as exc:
        logger.exception("acquisition gainers-decliners failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/filter-options", summary="Distinct filter values for dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:
        logger.exception("acquisition filter_options failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


@router.get("/geo", summary="Geographic performance — orders & RTO by pincode / city / state / tier")
async def geo(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    group_by:   str              = Query("pincode", description="pincode | city | state | tier"),
    campaigns:  list[str] | None = Query(None),
) -> dict[str, Any]:
    today = date.today()
    end   = end_date   or today
    start = start_date or (end - timedelta(days=30))
    f     = MetaAdsFilters(start_date=start, end_date=end, campaigns=campaigns)
    try:
        return await asyncio.to_thread(_service().geo_performance, f, group_by)
    except Exception as exc:
        logger.exception("acquisition geo failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
