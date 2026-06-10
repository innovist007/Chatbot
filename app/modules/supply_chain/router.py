"""Supply chain dashboard endpoints."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.supply_chain.service import (
    SEGMENT_COLUMNS,
    SupplyChainFilters,
    SupplyChainService,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/supply-chain",
    tags=["supply-chain"],
    dependencies=[Depends(get_current_user)],
)


def _filters(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_mode:  str  = Query("MoM"),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> SupplyChainFilters:
    return SupplyChainFilters(
        start_date=start_date, end_date=end_date,
        compare_mode=compare_mode,
        compare_start=compare_start, compare_end=compare_end,
    )


@lru_cache
def _service() -> SupplyChainService:
    return SupplyChainService(get_settings())


@router.get("/overview", summary="Bundled KPI sections for the dashboard top")
async def overview(f: SupplyChainFilters = Depends(_filters)) -> dict:
    svc = _service()
    results = await asyncio.gather(
        asyncio.to_thread(svc.overview,                  f),
        asyncio.to_thread(svc.waterfall,                 f),
        asyncio.to_thread(svc.ndr_funnel,                f),
        asyncio.to_thread(svc.delivery_day_distribution, f),
        asyncio.to_thread(svc.warehouse_table,           f),
        asyncio.to_thread(svc.courier_table,             f),
        asyncio.to_thread(svc.payment_table,             f),
        asyncio.to_thread(svc.courier_wh_matrix,         f),
        asyncio.to_thread(svc.top_pincodes,              f, 10),
        return_exceptions=True,
    )
    keys     = ["overview", "waterfall", "ndr_funnel", "delivery_day_distribution",
                "warehouse_table", "courier_table", "payment_table", "courier_wh_matrix", "top_pincodes"]
    defaults = [None, None, None, [], [], [], [], None, []]
    response = {}
    for key, result, default in zip(keys, results, defaults):
        if isinstance(result, Exception):
            logger.error("supply-chain overview section '%s' failed: %s", key, result)
            response[key] = default
        else:
            response[key] = result
    return response


@router.get("/waterfall", summary="Order waterfall: Total → Cancelled → RTO → Others → In-transit → Delivered")
async def waterfall(f: SupplyChainFilters = Depends(_filters)) -> dict:
    try:
        return await asyncio.to_thread(_service().waterfall, f)
    except Exception as exc:
        logger.error("waterfall failed: %s", exc); return {}

@router.get("/ndr-funnel", summary="NDR → Re-attempt → Delivered / RTO funnel")
async def ndr_funnel(f: SupplyChainFilters = Depends(_filters)) -> dict:
    try:
        return await asyncio.to_thread(_service().ndr_funnel, f)
    except Exception as exc:
        logger.error("ndr_funnel failed: %s", exc); return {}

@router.get("/warehouse-table", summary="Per-warehouse performance table")
async def warehouse_table(f: SupplyChainFilters = Depends(_filters)) -> list[dict]:
    try:
        return await asyncio.to_thread(_service().warehouse_table, f)
    except Exception as exc:
        logger.error("warehouse_table failed: %s", exc); return []

@router.get("/courier-table", summary="Per-courier performance table")
async def courier_table(f: SupplyChainFilters = Depends(_filters)) -> list[dict]:
    try:
        return await asyncio.to_thread(_service().courier_table, f)
    except Exception as exc:
        logger.error("courier_table failed: %s", exc); return []

@router.get("/payment-table", summary="COD vs Prepaid performance table")
async def payment_table(f: SupplyChainFilters = Depends(_filters)) -> list[dict]:
    try:
        return await asyncio.to_thread(_service().payment_table, f)
    except Exception as exc:
        logger.error("payment_table failed: %s", exc); return []

@router.get("/courier-wh-matrix", summary="Courier × warehouse RTO% matrix with row + column averages")
async def courier_wh_matrix(f: SupplyChainFilters = Depends(_filters)) -> dict:
    try:
        return await asyncio.to_thread(_service().courier_wh_matrix, f)
    except Exception as exc:
        logger.error("courier_wh_matrix failed: %s", exc); return {}

@router.get("/top-pincodes", summary="Top pincodes by RTO volume")
async def top_pincodes(
    limit: int = Query(10, ge=1, le=200),
    f: SupplyChainFilters = Depends(_filters),
) -> list[dict]:
    try:
        return await asyncio.to_thread(_service().top_pincodes, f, limit)
    except Exception as exc:
        logger.error("top_pincodes failed: %s", exc); return []

@router.get("/delivery-day-distribution", summary="Ordered → delivered day histogram (D0..D5+)")
async def delivery_day_distribution(f: SupplyChainFilters = Depends(_filters)) -> list[dict]:
    try:
        return await asyncio.to_thread(_service().delivery_day_distribution, f)
    except Exception as exc:
        logger.error("delivery_day_distribution failed: %s", exc); return []

@router.get("/trend", summary="Trend chart driven by segment + metric + granularity")
async def trend(
    segment:     str            = Query("overall", description="overall | warehouse | courier | payment | daytype"),
    metric:      str            = Query("rto",     description="rto | orders | eta | ndr | delivered_revenue"),
    granularity: str            = Query("MoM",     description="DoD | WoW | MoM"),
    sub_filter:  str | None     = Query(None,      description="Specific segment value, or 'all' for overlay"),
    f: SupplyChainFilters = Depends(_filters),
) -> dict:
    try:
        return await asyncio.to_thread(_service().trend, f, segment, metric, granularity, sub_filter)
    except Exception as exc:
        logger.error("supply-chain trend failed: %s", exc)
        return {"buckets": [], "series": [], "error": str(exc)}

@router.get("/segment-options", summary="Distinct values for a segment (warehouse / courier / payment / daytype)")
async def segment_options(
    segment: str | None = Query(None, description="Omit to get options for all segments"),
):
    svc = _service()
    if segment:
        if segment not in SEGMENT_COLUMNS:
            return []
        return await asyncio.to_thread(svc.segment_options, segment)
    return await asyncio.to_thread(svc.all_segment_options)


@router.get("/ai-summary/stream", summary="AI summary — SSE stream. Pushes one JSON event when ready.")
async def sc_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    svc    = _service()
    latest = await asyncio.to_thread(svc.get_latest_date)
    if not latest:
        async def _no_data():
            import json
            yield {"data": json.dumps({"summary": "No data available", "date": None})}
        return EventSourceResponse(_no_data(), headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})
    slot, data_date = ai_summary_dates()   # key on today (matches cron), display yesterday
    cache_key    = f"sc:ai_summary:{slot}"
    redis_client = svc.redis_client if svc.cache_enabled else None
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, _sc_prompt(data_date), data_date, agent),
    )


def _sc_prompt(as_of: str) -> str:
    return f"""Generate a brief 3-4 sentence executive summary of supply chain performance for {as_of}.
CRITICAL: Use ONLY data from `innovist-master-data.shopify.rto_analytics`.
Focus on: RTO %, NDR rate, dispatch TAT, worst-performing courier × warehouse cell, ETA delivery %.
Return plain text only — no charts, no SQL, no tables, no bullets."""
