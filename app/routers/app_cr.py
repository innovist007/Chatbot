"""App CR API endpoints."""
from datetime import date
from fastapi import APIRouter, Depends, Query
import logging

from app.config import get_settings, Settings
from app.deps import get_agent_service
from app.routers.auth import get_current_user
from app.services.app_cr_service import AppCRService, AppCRFilters
from app.services.agent_service import AgentService
logger = logging.getLogger(__name__)


router = APIRouter(prefix="/app-cr", tags=["app_cr"], dependencies=[Depends(get_current_user)],)


def get_app_cr_service(settings: Settings = Depends(get_settings)) -> AppCRService:
    return AppCRService(settings)


@router.get("/overview")
async def get_app_cr_overview(
    start_date: date = Query(...),
    end_date: date = Query(...),
    platforms: list[str] | None = Query(None),
    users: list[str] | None = Query(None),
    compare_mode: str = Query("MoM"),
    svc: AppCRService = Depends(get_app_cr_service),
):
    """Get App CR overview metrics with caching."""
    f = AppCRFilters(
        start_date=start_date,
        end_date=end_date,
        platforms=platforms,
        users=users,
        compare_mode=compare_mode,
    )
    
    return {
        "overview": svc.overview(f),
        "funnel": svc.funnel(f),
        "by_platform": svc.by_platform(f),
        "install_attribution": svc.install_attribution(f),
        "push_performance": svc.push_performance(f),
    }


@router.get("/filter-options")
async def get_filter_options(svc: AppCRService = Depends(get_app_cr_service)):
    """Get available filter values for App CR."""
    return svc.filter_options()

@router.get("/ai-summary", summary="AI summary of latest day data")
def app_cr_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    """Generate AI summary for the most recent day in data. Cached 24h."""
    
    # Create service instance
    service = AppCRService(settings)
    
    # Get most recent date with data
    latest_date = service.get_latest_date()
    if not latest_date:
        return {"summary": "No data available", "date": None}
    
    # Cache key based on the latest date
    cache_key = f"app_cr_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached
    
    # Build prompt
    prompt = f"""Generate a brief 3-4 sentence executive summary of MOBILE APP performance for {latest_date.isoformat()}.

CRITICAL: Use ONLY data from this specific table:
`innovist-app-ga4-data-487906.analytics_446636559.data_table_session`

This is the MOBILE APP analytics table (NOT website data).

Query this table for:
- App opens (sessions where event is from mobile app)
- App conversion rate (purchases / sessions)
- App AOV (average order value from app)
- Revenue from app
- Compare {latest_date.isoformat()} to the previous day

Focus on insights specific to MOBILE APP:
- Android vs iOS performance
- Install attribution
- App-specific user behavior

IMPORTANT RULES:
- Use ONLY the mobile app table mentioned above
- Return ONLY 3-4 sentences of plain text
- NO charts, NO tables, NO SQL queries shown
- NO bullet points or lists
- Just flowing prose with key MOBILE APP metrics"""

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