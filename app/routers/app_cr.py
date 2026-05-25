"""App CR API endpoints."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.deps import get_agent_service
from app.routers.auth import get_current_user
from app.services.agent_service import AgentService
from app.services.app_cr_service import AppCRFilters, AppCRService

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
    start_date: date = Query(...),
    end_date: date = Query(...),
    platforms: list[str] | None = Query(None),
    users: list[str] | None = Query(None),
    compare_mode: str = Query("MoM"),
    compare_start: date | None = Query(None),
    compare_end: date | None = Query(None),
):
    svc = _service()
    f = AppCRFilters(
        start_date=start_date,
        end_date=end_date,
        platforms=platforms,
        users=users,
        compare_mode=compare_mode,
        compare_start=compare_start,
        compare_end=compare_end,
    )
    overview, funnel, by_platform, install_attribution, push_performance = await asyncio.gather(
        asyncio.to_thread(svc.overview, f),
        asyncio.to_thread(svc.funnel, f),
        asyncio.to_thread(svc.by_platform, f),
        asyncio.to_thread(svc.install_attribution, f),
        asyncio.to_thread(svc.push_performance, f),
    )
    return {
        "overview":            overview,
        "funnel":              funnel,
        "by_platform":         by_platform,
        "install_attribution": install_attribution,
        "push_performance":    push_performance,
    }


@router.get("/filter-options")
async def get_filter_options():
    return await asyncio.to_thread(_service().filter_options)


@router.get("/ai-summary", summary="AI summary of latest day data")
async def app_cr_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    service = _service()

    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        return {"summary": "No data available", "date": None}

    cache_key = f"app_cr_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached

    prompt = f"""Generate a brief 3-4 sentence executive summary of MOBILE APP performance for {latest_date.isoformat()}.

CRITICAL: Use ONLY data from this specific table:
`innovist-app-ga4-data-487906.analytics_446636559.data_table_session`

Focus on app opens, conversion rate, AOV, revenue, and compare to previous day.
Return ONLY 3-4 sentences of plain text — no charts, no SQL, no bullets."""

    try:
        result = await asyncio.to_thread(agent.ask, prompt)
        response = {
            "summary": result.get("answer", "Unable to generate summary"),
            "date":    latest_date.isoformat(),
        }
        service._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("App CR AI summary failed")
        return {
            "summary": f"Could not generate AI summary: {exc}",
            "date":    latest_date.isoformat(),
        }
