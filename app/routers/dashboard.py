"""Dashboard endpoints — direct BigQuery, no LLM."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.config import get_settings
from app.services.dashboard_service import DashboardFilters, DashboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@lru_cache
def _service() -> DashboardService:
    return DashboardService(get_settings())


def _parse_filters(
    start_date: date | None,
    end_date: date | None,
    timeframe: str,
    platform_types: list[str] | None,
    statuses: list[str] | None,
    payment_modes: list[str] | None,
) -> DashboardFilters:
    today = date.today()
    end = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return DashboardFilters(
        start_date=start, end_date=end, timeframe=timeframe,
        platform_types=platform_types, statuses=statuses, payment_modes=payment_modes,
    )


@router.get("/d2c-sales", summary="D2C Sales dashboard payload")
def d2c_sales(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    timeframe: str = Query("day", pattern="^(day|week|month|quarter|year)$"),
    platform_types: list[str] | None = Query(None),
    statuses: list[str] | None = Query(None),
    payment_modes: list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(start_date, end_date, timeframe, platform_types, statuses, payment_modes)
    svc = _service()
    try:
        return {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date": f.end_date.isoformat(),
                "timeframe": f.timeframe,
            },
            "kpis":             svc.kpis(f),
            "revenue_series":   svc.revenue_series(f),
            "waterfall":        svc.revenue_waterfall(f),
            "by_platform":      svc.revenue_split(f, "Platform_type"),
            "by_payment_mode":  svc.revenue_split(f, "Modes_of_payments"),
            "by_customer_type": svc.revenue_split(f, "cust_type"),
            "by_status":        svc.revenue_split(f, "shipment_status"),
            "top_dimensions":   svc.top_dimensions(f),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("d2c_sales dashboard failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Dashboard query failed: {exc}",
        ) from exc


@router.get("/filter-options", summary="Distinct values for dashboard filter dropdowns")
def filter_options() -> dict[str, list[str]]:
    try:
        return _service().filter_options()
    except Exception as exc:  # noqa: BLE001
        logger.exception("filter_options failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not load filter options: {exc}",
        ) from exc