"""Web CR dashboard endpoints — direct BigQuery, no LLM."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.config import get_settings
from app.services.web_cr_service import WebCRFilters, WebCRService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/web-cr", tags=["web-cr"])


@lru_cache
def _service() -> WebCRService:
    return WebCRService(get_settings())


def _parse_filters(
    start_date: date | None,
    end_date: date | None,
    channel_groups: list[str] | None,
    devices: list[str] | None,
    countries: list[str] | None,
) -> WebCRFilters:
    today = date.today()
    end = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return WebCRFilters(
        start_date=start, end_date=end,
        channel_groups=channel_groups, devices=devices, countries=countries,
    )


@router.get("", summary="Full Web CR dashboard payload")
def web_cr(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    channel_groups: list[str] | None = Query(None),
    devices: list[str] | None = Query(None),
    countries: list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(start_date, end_date, channel_groups, devices, countries)
    svc = _service()
    try:
        return {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date": f.end_date.isoformat(),
            },
            "overview":      svc.overview(f),
            "funnel":        svc.funnel(f),
            "by_source":     svc.by_source(f),
            "by_device":     svc.by_device(f),
            "by_country":    svc.by_country(f),
            "landing_pages": svc.landing_pages(f),
            "by_hour":       svc.by_hour(f),
            "cr_trend":      svc.cr_trend(f),
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_cr dashboard failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Web CR query failed: {exc}",
        ) from exc


@router.get("/filter-options", summary="Distinct values for Web CR dropdowns")
def filter_options() -> dict[str, list[str]]:
    try:
        return _service().filter_options()
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_cr filter_options failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not load filter options: {exc}",
        ) from exc