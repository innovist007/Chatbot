from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.config import get_settings
from app.modules.acquisition.tabs.partnership.service import PartnershipFilters, PartnershipService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _service() -> PartnershipService:
    return PartnershipService(get_settings())


def _parse_filters(
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
        compare_mode=compare_mode,
        compare_start=compare_start, compare_end=compare_end,
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
    f   = _parse_filters(start_date, end_date, sources, compare_mode, compare_start, compare_end)
    svc = _service()
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
