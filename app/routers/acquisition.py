"""Acquisition dashboard endpoints — Meta Ads + Partnerships."""
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
from app.services.meta_ads_service import MetaAdsFilters, MetaAdsService
from app.services.partnership_service import PartnershipFilters, PartnershipService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/acquisition",
    tags=["acquisition"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> MetaAdsService:
    return MetaAdsService(get_settings())


@lru_cache
def _partnership_service() -> PartnershipService:
    return PartnershipService(get_settings())


def _parse_filters(
    start_date: date | None,
    end_date: date | None,
    campaigns: list[str] | None,
    stages: list[str] | None,
    creative_types: list[str] | None,
    brands: list[str] | None,
    languages: list[str] | None,
    ad_names: list[str] | None,
    compare_start: date | None = None,
    compare_end: date | None = None,
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
        compare_start=compare_start,
        compare_end=compare_end,
    )


# ------------------------------------------------------------------ Overview
@router.get("/overview", summary="KPIs, diagnostic funnel, stage/creative breakdown, fatigued ads")
async def overview(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    compare_start: date | None = Query(None),
    compare_end: date | None = Query(None),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                         compare_start=compare_start, compare_end=compare_end)
    svc = _service()
    try:
        kpis, stage_breakdown, creative_table, diagnostic, fatigued_ads = await asyncio.gather(
            asyncio.to_thread(svc.kpis, f),
            asyncio.to_thread(svc.stage_breakdown, f),
            asyncio.to_thread(svc.creative_table, f),
            asyncio.to_thread(svc.diagnostic_funnel, f),
            asyncio.to_thread(svc.fatigued_ads, f),
        )
        return {
            "filters":         {"start_date": f.start_date.isoformat(), "end_date": f.end_date.isoformat()},
            "kpis":            kpis,
            "stage_breakdown": stage_breakdown,
            "creative_table":  creative_table,
            "funnel_cvr":      diagnostic,   # kept for backward compat
            "diagnostic":      diagnostic,
            "fatigued_ads":    fatigued_ads,
        }
    except Exception as exc:
        logger.exception("acquisition overview failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Waterfall P&L
@router.get("/waterfall", summary="P&L waterfall — Shopify / Meta / GA4 source comparison")
async def waterfall(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.waterfall, f)
    except Exception as exc:
        logger.exception("acquisition waterfall failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Trend
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
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.daily_trend, f, granularity)
    except Exception as exc:
        logger.exception("acquisition trend failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Performance table (campaign / ad)
@router.get("/table", summary="Performance table — full P&L per campaign or ad")
async def table(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    level: str = Query("campaign", description="campaign | ad"),
    compare_mode: str = Query("MoM", description="DoD | WoW | MoM"),
    compare_start: date | None = Query(None),
    compare_end: date | None = Query(None),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.campaign_table, f, level, compare_mode, compare_start, compare_end)
    except Exception as exc:
        logger.exception("acquisition table failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Pivot table (brand × creative × language)
@router.get("/pivot-table", summary="Pivot — brand / creative_type / language breakdown")
async def pivot_table(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    pivot_by: str = Query("brand", description="brand | creative_type | language | brand_creative | full"),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.pivot_table, f, pivot_by)
    except Exception as exc:
        logger.exception("acquisition pivot-table failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ Gainers / Decliners
@router.get("/gainers-decliners", summary="Top 10 gainers and decliners vs prior period")
async def gainers_decliners(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    compare_start: date | None = Query(None),
    compare_end: date | None = Query(None),
    level: str = Query("campaign", description="campaign | ad"),
    sort_by: str = Query("roas_delta", description="roas_delta | rev_delta | roas_delta_pct"),
    campaigns: list[str] | None = Query(None),
    stages: list[str] | None = Query(None),
    creative_types: list[str] | None = Query(None),
    brands: list[str] | None = Query(None),
    languages: list[str] | None = Query(None),
    ad_names: list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, campaigns, stages, creative_types, brands, languages, ad_names,
                         compare_start=compare_start, compare_end=compare_end)
    svc = _service()
    try:
        return await asyncio.to_thread(svc.gainers_decliners, f, level, sort_by)
    except Exception as exc:
        logger.exception("acquisition gainers-decliners failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ------------------------------------------------------------------ AI summary
@router.get("/ai-summary", summary="AI summary for the selected period. Cached 24h.")
async def ai_summary(
    end_date: date | None = Query(None),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    svc    = _service()
    as_of  = (end_date or date.today()).isoformat()
    cache_key = f"acquisition_ai_summary:{as_of}"

    cached = svc._get_cache(cache_key)
    if cached:
        return cached

    prompt = f"""Generate a brief 3-4 sentence executive summary of Meta Ads acquisition performance for the period ending {as_of}.

CRITICAL: Use ONLY data from this specific table:
`innovist-master-data.shopify.v_meta_spends_table`

Focus on:
- Total spend and ROAS (both Shopify/delivered and Meta-claimed)
- CM1 and CM2 margin health (CM2 = CM1 - Spends)
- CPM and CTR trends
- Top-performing campaign or creative type
- Any fatigued ads (high frequency, declining CTR)

IMPORTANT RULES:
- 3-4 sentences plain text only
- No charts, no SQL, no tables, no bullet points
- Mention specific numbers and percentages"""

    try:
        result   = await asyncio.to_thread(agent.ask, prompt)
        response = {
            "summary": result.get("answer", "Unable to generate summary"),
            "date":    as_of,
        }
        svc._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("Acquisition AI summary failed")
        return {"summary": f"Could not generate AI summary: {exc}", "date": as_of}


# ------------------------------------------------------------------ Filter options
@router.get("/filter-options", summary="Distinct filter values for dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:
        logger.exception("acquisition filter_options failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc


# ==============================================================================
# PARTNERSHIPS TAB
# ==============================================================================

def _parse_partnership_filters(
    start_date:    date | None,
    end_date:      date | None,
    sources:       list[str] | None,
    compare_mode:  str = "MoM",
    compare_start: date | None = None,
    compare_end:   date | None = None,
) -> PartnershipFilters:
    today = date.today()
    end   = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return PartnershipFilters(
        start_date=start, end_date=end, sources=sources,
        compare_mode=compare_mode, compare_start=compare_start, compare_end=compare_end,
    )


@router.get("/partnership", summary="Partnership tab — KPIs, partner rows, monthly trend")
async def partnership(
    start_date:    date | None      = Query(None),
    end_date:      date | None      = Query(None),
    sources:       list[str] | None = Query(None, description="gpay | phonepe | paytm"),
    compare_mode:  str              = Query("MoM"),
    compare_start: date | None      = Query(None),
    compare_end:   date | None      = Query(None),
) -> dict[str, Any]:
    f   = _parse_partnership_filters(start_date, end_date, sources, compare_mode, compare_start, compare_end)
    svc = _partnership_service()
    try:
        kpis, partners, trend_data = await asyncio.gather(
            asyncio.to_thread(svc.kpis,     f),
            asyncio.to_thread(svc.partners, f),
            asyncio.to_thread(svc.trend,    f),
        )
        return {
            "filters":  {"start_date": f.start_date.isoformat(), "end_date": f.end_date.isoformat()},
            "kpis":     kpis,
            "partners": partners,
            "trend":    trend_data,
        }
    except Exception as exc:
        logger.exception("partnership endpoint failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc
