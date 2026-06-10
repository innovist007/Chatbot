"""Web CR dashboard endpoints — direct BigQuery, no LLM."""
from __future__ import annotations

import asyncio
import logging
from datetime import date, timedelta
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.web_cr.filters import WebCRFilters
from app.modules.web_cr.service import WebCRService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/web-cr",
    tags=["web-cr"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> WebCRService:
    return WebCRService(get_settings())


def _parse_filters(
    start_date:     date | None,
    end_date:       date | None,
    compare_mode:   str,
    channel_groups: list[str] | None,
    devices:        list[str] | None,
    countries:      list[str] | None,
    campaigns:      list[str] | None,
    content_groups: list[str] | None,
    landing_pages:  list[str] | None,
    session_types:  list[str] | None,
    compare_start:  date | None = None,
    compare_end:    date | None = None,
) -> WebCRFilters:
    today = date.today()
    end   = end_date or today
    start = start_date or (end - timedelta(days=30))
    if start > end:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")
    return WebCRFilters(
        start_date=start, end_date=end,
        compare_mode=compare_mode,
        compare_start=compare_start, compare_end=compare_end,
        channel_groups=channel_groups, devices=devices, countries=countries,
        campaigns=campaigns, content_groups=content_groups,
        landing_pages=landing_pages, session_types=session_types,
    )


@router.get("", summary="Full Web CR dashboard payload")
async def web_cr(
    start_date:     date | None      = Query(None),
    end_date:       date | None      = Query(None),
    compare_mode:   str              = Query("MoM"),
    compare_start:  date | None      = Query(None),
    compare_end:    date | None      = Query(None),
    channel_groups: list[str] | None = Query(None),
    devices:        list[str] | None = Query(None),
    countries:      list[str] | None = Query(None),
    campaigns:      list[str] | None = Query(None),
    content_groups: list[str] | None = Query(None),
    landing_pages:  list[str] | None = Query(None),
    session_types:  list[str] | None = Query(None),
) -> dict[str, Any]:
    f   = _parse_filters(
        start_date, end_date, compare_mode, channel_groups, devices, countries,
        campaigns, content_groups, landing_pages, session_types,
        compare_start, compare_end,
    )
    svc = _service()
    try:
        KEYS = [
            "overview", "funnel", "funnel_by_channel", "funnel_by_device",
            "funnel_heatmap", "page_funnel", "top_landing_pages", "top_channels",
            "top_content_groups", "channel_table", "channel_trend", "content_group_cr",
            "product_pages", "top_campaigns", "by_source", "by_device", "by_country",
            "landing_pages", "by_hour", "cr_trend",
            "funnel_trend", "channel_funnel_trend", "landing_page_funnel_trend",
        ]
        DEFAULTS = [
            None, [], [], [], [], [], [], [], [], [], {"channels": [], "rows": []}, [],
            [], [], [], [], [], [], [], [],
            [], {"channels": [], "rows": []}, {"pages": [], "rows": []},
        ]
        results = await asyncio.gather(
            asyncio.to_thread(svc.overview,                  f),
            asyncio.to_thread(svc.funnel,                    f),
            asyncio.to_thread(svc.funnel_by_channel,         f),
            asyncio.to_thread(svc.funnel_by_device,          f),
            asyncio.to_thread(svc.funnel_hourly_heatmap,     f),
            asyncio.to_thread(svc.page_funnel,               f),
            asyncio.to_thread(svc.top_landing_pages,         f),
            asyncio.to_thread(svc.top_channels,              f),
            asyncio.to_thread(svc.top_content_groups,        f),
            asyncio.to_thread(svc.channel_table,             f),
            asyncio.to_thread(svc.channel_trend,             f, 5),
            asyncio.to_thread(svc.content_group_cr,          f),
            asyncio.to_thread(svc.product_pages,             f),
            asyncio.to_thread(svc.top_campaigns,             f),
            asyncio.to_thread(svc.by_source,                 f),
            asyncio.to_thread(svc.by_device,                 f),
            asyncio.to_thread(svc.by_country,                f),
            asyncio.to_thread(svc.landing_pages,             f),
            asyncio.to_thread(svc.by_hour,                   f),
            asyncio.to_thread(svc.cr_trend,                  f),
            asyncio.to_thread(svc.funnel_trend,              f),
            asyncio.to_thread(svc.channel_funnel_trend,      f, 5),
            asyncio.to_thread(svc.landing_page_funnel_trend, f, 10),
            return_exceptions=True,
        )
        payload: dict[str, Any] = {
            "filters": {
                "start_date": f.start_date.isoformat(),
                "end_date":   f.end_date.isoformat(),
            }
        }
        for key, result, default in zip(KEYS, results, DEFAULTS):
            if isinstance(result, Exception):
                logger.error("web_cr section '%s' failed: %s", key, result)
                payload[key] = default
            else:
                payload[key] = result
        return payload
    except Exception as exc:
        logger.exception("web_cr dashboard failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Web CR query failed: {exc}",
        ) from exc


@router.get("/filter-options", summary="Distinct values for Web CR dropdowns")
async def filter_options() -> dict[str, list[str]]:
    try:
        return await asyncio.to_thread(_service().filter_options)
    except Exception as exc:
        logger.exception("web_cr filter_options failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not load filter options: {exc}",
        ) from exc


@router.get("/latest-date", summary="Most recent date with data in BigQuery")
async def latest_date() -> dict[str, str | None]:
    try:
        d = await asyncio.to_thread(_service().get_latest_date)
        return {"date": d.isoformat() if d else None}
    except Exception as exc:
        logger.warning("latest_date failed: %s", exc)
        return {"date": None}


@router.get("/ai-summary/stream", summary="AI summary — SSE stream. Pushes one JSON event when ready.")
async def web_cr_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    service = _service()
    latest  = await asyncio.to_thread(service.get_latest_date)
    if not latest:
        async def _no_data():
            import json
            yield {"data": json.dumps({"summary": "No data available", "date": None})}
        return EventSourceResponse(_no_data(), headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})
    slot, data_date = ai_summary_dates()   # key on today (matches cron), display yesterday
    cache_key    = f"webcr:ai_summary:{slot}"
    redis_client = service.redis_client if service.cache_enabled else None
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, _web_cr_prompt(data_date), data_date, agent),
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )


def _web_cr_prompt(as_of: str) -> str:
    return f"""Generate a brief 3-4 sentence executive summary of WEBSITE performance for {as_of}.
CRITICAL: Use ONLY data from `innovist-master-data.analytics_432719895.data_table_session`.
Focus on: web sessions, conversion rate, AOV, top traffic sources, device breakdown.
Return 3-4 sentences of plain text only — no bullets, no markdown, no SQL."""
