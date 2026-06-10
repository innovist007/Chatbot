"""Dashboard endpoints (legacy D2C sales)."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import get_settings
from app.modules.auth.router import get_current_user
from app.modules.dashboard.service import DashboardFilters, DashboardService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/dashboard",
    tags=["dashboard"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> DashboardService:
    return DashboardService(get_settings())


def _parse_filters(
    start_date:     date | None,
    end_date:       date | None,
    timeframe:      str,
    platform_types: list[str] | None,
    statuses:       list[str] | None,
    payment_modes:  list[str] | None,
) -> DashboardFilters:
    today = date.today()
    end   = end_date   or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return DashboardFilters(
        start_date=start, end_date=end, timeframe=timeframe,
        platform_types=platform_types, statuses=statuses, payment_modes=payment_modes,
    )


@router.get("/d2c-sales", summary="D2C Sales dashboard payload")
async def d2c_sales(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    timeframe:      str              = Query("day", pattern="^(day|week|month|quarter|year)$"),
    platform_types: list[str] | None = Query(None),
    statuses:       list[str] | None = Query(None),
    payment_modes:  list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(start_date, end_date, timeframe, platform_types, statuses, payment_modes)
    svc = _service()
    try:
        kpis, revenue_series, waterfall, by_platform, by_payment_mode, by_customer_type, by_status, top_dimensions = (
            await asyncio.gather(
                asyncio.to_thread(svc.kpis,           f),
                asyncio.to_thread(svc.revenue_series, f),
                asyncio.to_thread(svc.revenue_waterfall, f),
                asyncio.to_thread(svc.revenue_split, f, "Platform_type"),
                asyncio.to_thread(svc.revenue_split, f, "Modes_of_payments"),
                asyncio.to_thread(svc.revenue_split, f, "cust_type"),
                asyncio.to_thread(svc.revenue_split, f, "shipment_status"),
                asyncio.to_thread(svc.top_dimensions, f),
            )
        )
        return {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date":   f.end_date.isoformat(),
                "timeframe":  f.timeframe,
            },
            "kpis":             kpis,
            "revenue_series":   revenue_series,
            "waterfall":        waterfall,
            "by_platform":      by_platform,
            "by_payment_mode":  by_payment_mode,
            "by_customer_type": by_customer_type,
            "by_status":        by_status,
            "top_dimensions":   top_dimensions,
        }
    except Exception as exc:
        logger.exception("d2c_sales dashboard failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Dashboard query failed: {exc}") from exc


@router.get("/filter-options", summary="Distinct values for dashboard filter dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:
        logger.exception("filter_options failed")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not load filter options: {exc}") from exc
