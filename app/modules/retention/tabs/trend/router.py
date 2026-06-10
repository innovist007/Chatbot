from __future__ import annotations

import asyncio
import logging
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.modules.retention.helpers import (
    VALID_GRANULARITY, VALID_SEGMENTS, VALID_WINDOWS, bad_gateway, build_filters,
)
from app.modules.retention.tabs.trend.service import TrendService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _svc() -> TrendService:
    return TrendService(get_settings())


@router.get("/trend", summary="Retention trend by segment and time granularity")
async def retention_trend(
    start_date:  date | None      = Query(None),
    end_date:    date | None      = Query(None),
    brands:      list[str] | None = Query(None),
    segment:     str              = Query("brand", description="brand|product|channel|discount|payment|platform"),
    window:      str              = Query("30d",   description="7d|14d|30d|60d|90d|120d|180d|360d"),
    granularity: str              = Query("WoW",   description="DoD|WoW|MoM|YoY"),
) -> list[dict[str, Any]]:
    if segment not in VALID_SEGMENTS:
        raise HTTPException(400, f"segment must be one of {VALID_SEGMENTS}")
    if window not in VALID_WINDOWS:
        raise HTTPException(400, f"window must be one of {VALID_WINDOWS}")
    if granularity not in VALID_GRANULARITY:
        raise HTTPException(400, f"granularity must be one of {VALID_GRANULARITY}")
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().retention_trend, f, segment, window, granularity)
    except Exception as exc:
        bad_gateway(exc, "retention/trend")


@router.get("/ltv-cac", summary="Realized LTV (90d) vs CAC by cohort month")
async def ltv_cac(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().ltv_cac_trend, f)
    except Exception as exc:
        bad_gateway(exc, "retention/ltv-cac")


@router.get("/brand-mix", summary="Monthly brand buyer mix — NTB / existing / cross-brand")
async def brand_mix(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().brand_mix, f)
    except Exception as exc:
        bad_gateway(exc, "retention/brand-mix")


@router.get("/brand-overlap", summary="Brand overlap Venn counts by order-count cohort")
async def brand_overlap(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().brand_overlap, f)
    except Exception as exc:
        bad_gateway(exc, "retention/brand-overlap")
