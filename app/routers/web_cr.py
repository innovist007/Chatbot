"""Web CR dashboard endpoints — direct BigQuery, no LLM."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.routers.auth import get_current_user

from app.config import Settings,get_settings
from app.services import web_cr_service
from app.services.web_cr_service import WebCRFilters, WebCRService

from app.deps import get_agent_service
from app.services.agent_service import AgentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/web-cr", tags=["web-cr"],dependencies=[Depends(get_current_user)],)


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

# For AI summary
@router.get("/ai-summary", summary="AI summary of latest day data")
def web_cr_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    """Generate AI summary for the most recent day in data. Cached 24h."""
    
    # Create service instance
    service = WebCRService(settings)
    
    # Get most recent date with data
    latest_date = service.get_latest_date()
    if not latest_date:
        return {"summary": "No data available", "date": None}
    
    # Cache key based on the latest date
    cache_key = f"web_cr_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached
    
    # Build prompt
    prompt = f"""Generate a brief 3-4 sentence executive summary of WEBSITE performance for {latest_date.isoformat()}.

CRITICAL: Use ONLY data from this specific table:
`innovist-master-data.analytics_432719895.data_table_session`

This is the WEBSITE analytics table (NOT mobile app data).

Query this table for:
- Web sessions (website visits)
- Web conversion rate (purchases / sessions)
- Web AOV
- Total revenue from website
- Compare {latest_date.isoformat()} to the previous day

Focus on insights specific to WEBSITE:
- Top traffic sources (organic, paid, direct)
- Device breakdown (mobile web, desktop, tablet)
- Channel performance

IMPORTANT RULES:
- Use ONLY the website table mentioned above
- Return ONLY 3-4 sentences of plain text
- NO charts, NO tables, NO SQL queries shown
- NO bullet points or lists
- Just flowing prose with key WEBSITE metrics"""

    try:
        result = agent.ask(prompt)
        answer = result.get("answer", "Unable to generate summary")
        response = {
            "summary": answer,
            "date": latest_date.isoformat(),
        }
        # Cache for 24 hours
        service._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("AI summary generation failed")
        return {
            "summary": f"Could not generate AI summary: {str(exc)}",
            "date": latest_date.isoformat() if latest_date else None,
        }