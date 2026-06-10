from __future__ import annotations

import asyncio
import logging
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Query

from app.config import get_settings
from app.modules.retention.helpers import build_filters, bad_gateway
from app.modules.retention.tabs.overview.service import OverviewService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _svc() -> OverviewService:
    return OverviewService(get_settings())


@router.get("/overview", summary="Overview tab — key metrics, windows, heatmap, composition")
async def overview(
    start_date: date | None       = Query(None),
    end_date:   date | None       = Query(None),
    brands:     list[str] | None  = Query(None),
) -> dict[str, Any]:
    f   = build_filters(start_date, end_date, brands)
    svc = _svc()
    try:
        key_metrics, windows, heatmap, composition = await asyncio.gather(
            asyncio.to_thread(svc.key_metrics,          f),
            asyncio.to_thread(svc.retention_windows,    f),
            asyncio.to_thread(svc.cohort_heatmap,       f),
            asyncio.to_thread(svc.customer_composition, f),
        )
        return {
            "filters":        {"start_date": f.start_date.isoformat(), "end_date": f.end_date.isoformat(), "brands": f.brands},
            "key_metrics":    key_metrics,
            "windows":        windows,
            "cohort_heatmap": heatmap,
            "composition":    composition,
        }
    except Exception as exc:
        bad_gateway(exc, "retention/overview")


@router.get("/key-metrics", summary="KPI cards — repeat rate, LTV, AOV, freq, CAC payback, loyal")
async def key_metrics(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> dict[str, Any]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().key_metrics, f)
    except Exception as exc:
        bad_gateway(exc, "retention/key-metrics")


@router.get("/retention-windows", summary="Freq× and ret% for 7/14/30/60/90/120/180/360d windows")
async def retention_windows(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> dict[str, Any]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().retention_windows, f)
    except Exception as exc:
        bad_gateway(exc, "retention/retention-windows")


@router.get("/cohort-heatmap", summary="M0–M8 cohort retention triangle")
async def cohort_heatmap(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().cohort_heatmap, f)
    except Exception as exc:
        bad_gateway(exc, "retention/cohort-heatmap")


@router.get("/composition", summary="Order-count / recency / LTV-bucket breakdowns")
async def composition(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> dict[str, Any]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().customer_composition, f)
    except Exception as exc:
        bad_gateway(exc, "retention/composition")
