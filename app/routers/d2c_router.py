"""D2C section API endpoints.

Handles all D2C tabs:
- /d2c/overview - Overview tab
- /d2c/web-cr - Web CR tab (delegates to web_cr_service)
- /d2c/app-cr - App CR tab (future)
- /d2c/rto - RTO tab (future)
- etc.
"""
from datetime import date
from fastapi import APIRouter, Depends, Query

from app.config import get_settings, Settings
from app.services.d2c_service import D2CService, D2CFilters
from app.routers.auth import get_current_user

router = APIRouter(prefix="/d2c", tags=["d2c"], dependencies=[Depends(get_current_user)])


def get_d2c_service(settings: Settings = Depends(get_settings)) -> D2CService:
    return D2CService(settings)


@router.get("/overview")
async def get_d2c_overview(
    start_date: date = Query(...),
    end_date: date = Query(...),
    brands: list[str] | None = Query(None),
    platforms: list[str] | None = Query(None),
    customers: list[str] | None = Query(None),
    svc: D2CService = Depends(get_d2c_service),
):
    """Get D2C Overview tab metrics with caching."""
    f = D2CFilters(
        start_date=start_date,
        end_date=end_date,
        brands=brands,
        platforms=platforms,
        customers=customers,
    )
    
    return {
        "overview": svc.overview(f),
        "by_platform": svc.by_platform(f),
        "revenue_trend": svc.revenue_trend(f),
    }


@router.get("/filter-options")
async def get_filter_options(svc: D2CService = Depends(get_d2c_service)):
    """Get available filter values for D2C section."""
    return svc.filter_options()


# Future endpoints for other D2C tabs:
# @router.get("/app-cr")
# @router.get("/rto")
# @router.get("/repeat")
# @router.get("/promo")