from __future__ import annotations

import asyncio
import logging
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Query

from app.config import get_settings
from app.modules.retention.helpers import bad_gateway, build_filters
from app.modules.retention.tabs.unit_economics.service import UnitEconomicsService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _svc() -> UnitEconomicsService:
    return UnitEconomicsService(get_settings())


@router.get("/contribution-margin", summary="Gross LTV, returns, net CM per customer")
async def contribution_margin(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> dict[str, Any]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().contribution_margin, f)
    except Exception as exc:
        bad_gateway(exc, "retention/contribution-margin")


@router.get("/pnl-trend", summary="Revenue trend by period × brand × platform × customer type")
async def pnl_trend(
    start_date:  date | None      = Query(None),
    end_date:    date | None      = Query(None),
    brands:      list[str] | None = Query(None),
    granularity: str              = Query("month", description="day | week | month"),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().pnl_trend, f, granularity)
    except Exception as exc:
        bad_gateway(exc, "retention/pnl-trend")
