"""Web CR dashboard endpoints — direct BigQuery, no LLM."""
from __future__ import annotations

import asyncio
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
    campaigns: list[str] | None,
    content_groups: list[str] | None,
    landing_pages: list[str] | None,
    session_types: list[str] | None,
) -> WebCRFilters:
    today = date.today()
    end = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return WebCRFilters(
        start_date=start, end_date=end,
        channel_groups=channel_groups, devices=devices, countries=countries,
        campaigns=campaigns, content_groups=content_groups,
        landing_pages=landing_pages, session_types=session_types,
    )


@router.get("", summary="Full Web CR dashboard payload")
async def web_cr(
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    channel_groups: list[str] | None = Query(None),
    devices: list[str] | None = Query(None),
    countries: list[str] | None = Query(None),
    campaigns: list[str] | None = Query(None),
    content_groups: list[str] | None = Query(None),
    landing_pages: list[str] | None = Query(None),
    session_types: list[str] | None = Query(None),
) -> dict[str, Any]:
    f = _parse_filters(
        start_date, end_date, channel_groups, devices, countries,
        campaigns, content_groups, landing_pages, session_types,
    )
    svc = _service()
    try:
        (
            overview,
            funnel,
            funnel_by_channel,
            funnel_by_device,
            funnel_heatmap,
            page_funnel,
            top_landing_pages,
            top_channels,
            top_content_groups,
            channel_table,
            channel_trend,
            content_group_cr,
            product_pages,
            top_campaigns,
            by_source,
            by_device,
            by_country,
            landing_pages_data,
            by_hour,
            cr_trend,
        ) = await asyncio.gather(
            asyncio.to_thread(svc.overview, f),
            asyncio.to_thread(svc.funnel, f),
            asyncio.to_thread(svc.funnel_by_channel, f),
            asyncio.to_thread(svc.funnel_by_device, f),
            asyncio.to_thread(svc.funnel_hourly_heatmap, f),
            asyncio.to_thread(svc.page_funnel, f),
            asyncio.to_thread(svc.top_landing_pages, f),
            asyncio.to_thread(svc.top_channels, f),
            asyncio.to_thread(svc.top_content_groups, f),
            asyncio.to_thread(svc.channel_table, f),
            asyncio.to_thread(svc.channel_trend, f, 5),
            asyncio.to_thread(svc.content_group_cr, f),
            asyncio.to_thread(svc.product_pages, f),
            asyncio.to_thread(svc.top_campaigns, f),
            asyncio.to_thread(svc.by_source, f),
            asyncio.to_thread(svc.by_device, f),
            asyncio.to_thread(svc.by_country, f),
            asyncio.to_thread(svc.landing_pages, f),
            asyncio.to_thread(svc.by_hour, f),
            asyncio.to_thread(svc.cr_trend, f),
        )
        return {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date": f.end_date.isoformat(),
            },
            "overview":          overview,
            "funnel":            funnel,
            "funnel_by_channel": funnel_by_channel,
            "funnel_by_device":  funnel_by_device,
            "funnel_heatmap":    funnel_heatmap,
            "page_funnel":       page_funnel,
            "top_landing_pages": top_landing_pages,
            "top_channels":      top_channels,
            "top_content_groups": top_content_groups,
            "channel_table":     channel_table,
            "channel_trend":     channel_trend,
            "content_group_cr":  content_group_cr,
            "product_pages":     product_pages,
            "top_campaigns":     top_campaigns,
            "by_source":         by_source,
            "by_device":         by_device,
            "by_country":        by_country,
            "landing_pages":     landing_pages_data,
            "by_hour":           by_hour,
            "cr_trend":          cr_trend,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_cr dashboard failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Web CR query failed: {exc}",
        ) from exc


@router.get("/filter-options", summary="Distinct values for Web CR dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:  # noqa: BLE001
        logger.exception("web_cr filter_options failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not load filter options: {exc}",
        ) from exc

# For AI summary
@router.get("/ai-summary", summary="AI summary of latest day data")
async def web_cr_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    service = WebCRService(settings)

    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        return {"summary": "No data available", "date": None}

    cache_key = f"web_cr_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached

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
        result = await asyncio.to_thread(agent.ask, prompt)
        response = {
            "summary": result.get("answer", "Unable to generate summary"),
            "date": latest_date.isoformat(),
        }
        service._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("AI summary generation failed")
        return {
            "summary": f"Could not generate AI summary: {str(exc)}",
            "date": latest_date.isoformat() if latest_date else None,
        }