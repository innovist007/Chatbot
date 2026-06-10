"""App CR API endpoints — AppsFlyer session data."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, Query

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.app_cr.service import AppCRFilters, AppCRService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/app-cr",
    tags=["app_cr"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> AppCRService:
    return AppCRService(get_settings())


@router.get("/overview")
async def get_app_cr_overview(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_mode:  str  = Query("previous_period"),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
):
    svc = _service()
    f = AppCRFilters(
        start_date=start_date,
        end_date=end_date,
        compare_mode=compare_mode,
        compare_start=compare_start,
        compare_end=compare_end,
    )
    (
        overview,
        daily_trend,
        funnel,
        os_funnel,
        media_sources,
        media_trend,
        campaigns,
        geo,
        app_versions,
        install_trend,
        install_attribution,
    ) = await asyncio.gather(
        asyncio.to_thread(svc.overview, f),
        asyncio.to_thread(svc.daily_trend, f),
        asyncio.to_thread(svc.funnel, f),
        asyncio.to_thread(svc.os_funnel, f),
        asyncio.to_thread(svc.media_sources, f),
        asyncio.to_thread(svc.media_trend, f),
        asyncio.to_thread(svc.campaigns, f),
        asyncio.to_thread(svc.geo, f),
        asyncio.to_thread(svc.app_versions, f),
        asyncio.to_thread(svc.install_trend, f),
        asyncio.to_thread(svc.install_attribution, f),
    )
    return {
        "overview":            overview,
        "daily_trend":         daily_trend,
        "funnel":              funnel,
        "os_funnel":           os_funnel,
        "media_sources":       media_sources,
        "media_trend":         media_trend,
        "campaigns":           campaigns,
        "geo":                 geo,
        "app_versions":        app_versions,
        "install_trend":       install_trend,
        "install_attribution": install_attribution,
    }


@router.get("/trend")
async def get_app_cr_trend(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    granularity:   str  = Query("day"),
    os:            str  = Query("All"),
    install_type:  str  = Query("All"),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
):
    svc = _service()
    f = AppCRFilters(
        start_date=start_date,
        end_date=end_date,
        compare_start=compare_start,
        compare_end=compare_end,
    )
    return await asyncio.to_thread(
        svc.filtered_trend, f, granularity, os, install_type
    )


@router.get("/filter-options")
async def get_filter_options():
    return {}


@router.get("/ai-summary/stream")
async def app_cr_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    service = _service()
    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        async def _no_data():
            import json
            yield {"data": json.dumps({"summary": "No data available", "date": None})}
        return EventSourceResponse(_no_data(), headers={"Cache-Control": "no-cache, no-store"})
    slot, data_date = ai_summary_dates()   # key on today (matches cron), display yesterday
    cache_key = f"appcr:ai_summary:{slot}"
    prompt = f"""Generate a 3-4 sentence executive summary of mobile app performance for {data_date}.
Use data from: innovist-master-data.appsflyer_transformed.appsflyer_data_table_session
Focus on installs, CVR, revenue, and top channel. Return plain text only."""
    redis_client = service.redis_client if service.cache_enabled else None
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, prompt, data_date, agent),
    )
