"""Supply chain dashboard endpoints."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import get_settings
from app.deps import get_agent_service
from app.routers.auth import get_current_user
from app.services.agent_service import AgentService
from app.services.supply_chain_service import (
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


# ----- Common filter dependency -----
def _filters(
    start_date: date = Query(...),
    end_date: date = Query(...),
    compare_mode: str = Query("MoM"),
    compare_start: date | None = Query(None),
    compare_end: date | None = Query(None),
) -> SupplyChainFilters:
    return SupplyChainFilters(
        start_date=start_date,
        end_date=end_date,
        compare_mode=compare_mode,
        compare_start=compare_start,
        compare_end=compare_end,
    )


@lru_cache
def _service() -> SupplyChainService:
    return SupplyChainService(get_settings())


# ============================================== Bundled overview
@router.get("/overview", summary="Bundled KPI sections for the dashboard top")
async def overview(
    f: SupplyChainFilters = Depends(_filters),
) -> dict:
    svc = _service()

    results = await asyncio.gather(
        asyncio.to_thread(svc.overview, f),
        asyncio.to_thread(svc.waterfall, f),
        asyncio.to_thread(svc.ndr_funnel, f),
        asyncio.to_thread(svc.delivery_day_distribution, f),
        asyncio.to_thread(svc.warehouse_table, f),
        asyncio.to_thread(svc.courier_table, f),
        asyncio.to_thread(svc.payment_table, f),
        asyncio.to_thread(svc.courier_wh_matrix, f),
        asyncio.to_thread(svc.top_pincodes, f, 10),
        return_exceptions=True,
    )

    keys = ["overview", "waterfall", "ndr_funnel", "delivery_day_distribution",
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


# ============================================== Per-section endpoints
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


# ============================================== Trend chart
@router.get("/trend", summary="Trend chart driven by segment + metric + granularity")
async def trend(
    segment: str = Query("overall", description="overall | warehouse | courier | payment | daytype"),
    metric: str = Query("rto", description="rto | orders | eta | ndr | delivered_revenue"),
    granularity: str = Query("MoM", description="DoD | WoW | MoM"),
    sub_filter: str | None = Query(None, description="Specific segment value, or 'all' for overlay"),
    f: SupplyChainFilters = Depends(_filters),
) -> dict:
    try:
        return await asyncio.to_thread(_service().trend, f, segment, metric, granularity, sub_filter)
    except Exception as exc:
        logger.error("supply-chain trend failed: %s", exc)
        return {"buckets": [], "series": [], "error": str(exc)}


# ============================================== Sub-pill options
@router.get("/segment-options", summary="Distinct values for a segment (warehouse / courier / payment / daytype)")
async def segment_options(
    segment: str | None = Query(None, description="Omit to get options for all segments"),
) -> dict:
    svc = _service()
    if segment:
        if segment not in SEGMENT_COLUMNS:
            return {"segment": segment, "options": []}
        return await asyncio.to_thread(svc.segment_options, segment)
    return await asyncio.to_thread(svc.all_segment_options)


# ============================================== AI summary
@router.get("/ai-summary", summary="AI summary for the most recent day. Cached 24h.")
async def ai_summary(
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str | None]:
    svc = _service()
    latest = await asyncio.to_thread(svc.get_latest_date)
    if not latest:
        return {"summary": "No data available", "date": None}

    cache_key = f"sc_ai_summary:{latest.isoformat()}"
    cached = svc._get_cache(cache_key)
    if cached:
        return cached

    prompt = f"""Generate a brief 3-4 sentence executive summary of supply chain performance for {latest.isoformat()}.

CRITICAL: Use ONLY data from this specific table:
`innovist-master-data.shopify.rto_analytics`

Focus on:
- RTO % (shipment_status in 'RTO', 'RTO-Failed', 'RTO-ShipmentDelay' / total)
- NDR rate (out_for_delivery_attempts > 1 / total) and NDR→RTO conversion
- Dispatch TAT (created_at_in_timezone - created_at), and worst-performing courier × warehouse cell
- % orders delivered within ETA (delivered_day_label in D0..D3)

IMPORTANT RULES:
- 3-4 sentences plain text only
- No charts, no SQL, no tables
- Mention specific numbers / percentages / partner names
"""
    try:
        result = await asyncio.to_thread(agent.ask, prompt)
        response = {
            "summary": result.get("answer", "Unable to generate summary"),
            "date": latest.isoformat(),
        }
        svc._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("Supply chain AI summary failed")
        return {
            "summary": f"Could not generate: {exc}",
            "date": latest.isoformat() if latest else None,
        }
