from __future__ import annotations

import asyncio
import logging
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.modules.retention.helpers import VALID_WINDOWS, bad_gateway, build_filters
from app.modules.retention.tabs.acquisition_quality.service import AcquisitionQualityService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _svc() -> AcquisitionQualityService:
    return AcquisitionQualityService(get_settings())


@router.get("/channel-quality", summary="CAC quality by acquisition channel with adjustable retention window")
async def channel_quality(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
    window:     str              = Query("30d", description="7d|30d|60d|120d|360d"),
) -> list[dict[str, Any]]:
    if window not in VALID_WINDOWS:
        raise HTTPException(400, f"window must be one of {VALID_WINDOWS}")
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().channel_quality, f, window)
    except Exception as exc:
        bad_gateway(exc, "retention/channel-quality")


@router.get("/discount-repeat", summary="Discount vs full-price first-order repeat rate by cohort month")
async def discount_repeat(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().discount_repeat, f)
    except Exception as exc:
        bad_gateway(exc, "retention/discount-repeat")


@router.get("/payment-split", summary="COD vs Prepaid repeat rate trend by cohort month")
async def payment_split(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().payment_split, f)
    except Exception as exc:
        bad_gateway(exc, "retention/payment-split")


@router.get("/city-tier", summary="Repeat rate, LTV, and unit economics by city tier")
async def city_tier(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().city_tier, f)
    except Exception as exc:
        bad_gateway(exc, "retention/city-tier")


@router.get("/aov-by-order", summary="AOV by order-count cohort (OC1/OC2/OC3/OC3+) per brand")
async def aov_by_order(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().aov_by_order, f)
    except Exception as exc:
        bad_gateway(exc, "retention/aov-by-order")
