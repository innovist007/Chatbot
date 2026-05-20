"""D2C section API endpoints."""
import asyncio
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, Query

from app.config import get_settings
from app.routers.auth import get_current_user
from app.services.d2c_service import D2CFilters, D2CService

router = APIRouter(
    prefix="/d2c",
    tags=["d2c"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> D2CService:
    return D2CService(get_settings())


@router.get("/overview")
async def get_d2c_overview(
    start_date: date = Query(...),
    end_date: date = Query(...),
    brands: list[str] | None = Query(None),
    platforms: list[str] | None = Query(None),
    customers: list[str] | None = Query(None),
):
    svc = _service()
    f = D2CFilters(
        start_date=start_date,
        end_date=end_date,
        brands=brands,
        platforms=platforms,
        customers=customers,
    )
    overview, by_platform, revenue_trend = await asyncio.gather(
        asyncio.to_thread(svc.overview, f),
        asyncio.to_thread(svc.by_platform, f),
        asyncio.to_thread(svc.revenue_trend, f),
    )
    return {
        "overview":      overview,
        "by_platform":   by_platform,
        "revenue_trend": revenue_trend,
    }


@router.get("/filter-options")
async def get_filter_options():
    return await asyncio.to_thread(_service().filter_options)
