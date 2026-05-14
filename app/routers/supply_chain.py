"""Supply chain dashboard endpoints."""
import logging
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
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
) -> SupplyChainFilters:
    return SupplyChainFilters(
        start_date=start_date,
        end_date=end_date,
        compare_mode=compare_mode,
    )


def _service(settings: Settings = Depends(get_settings)) -> SupplyChainService:
    return SupplyChainService(settings)


# ============================================== Bundled overview
@router.get("/overview", summary="Bundled KPI sections for the dashboard top")
def overview(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    return {
        "overview": svc.overview(f),
        "waterfall": svc.waterfall(f),
        "ndr_funnel": svc.ndr_funnel(f),
        "delivery_day_distribution": svc.delivery_day_distribution(f),
    }


# ============================================== Per-section endpoints
@router.get("/waterfall", summary="Order waterfall: Total → Cancelled → RTO → Others → In-transit → Delivered")
def waterfall(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    return svc.waterfall(f)


@router.get("/ndr-funnel", summary="NDR → Re-attempt → Delivered / RTO funnel")
def ndr_funnel(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    return svc.ndr_funnel(f)


@router.get("/warehouse-table", summary="Per-warehouse performance table")
def warehouse_table(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> list[dict]:
    return svc.warehouse_table(f)


@router.get("/courier-table", summary="Per-courier performance table")
def courier_table(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> list[dict]:
    return svc.courier_table(f)


@router.get("/payment-table", summary="COD vs Prepaid performance table")
def payment_table(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> list[dict]:
    return svc.payment_table(f)


@router.get("/courier-wh-matrix", summary="Courier × warehouse RTO% matrix with row + column averages")
def courier_wh_matrix(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    return svc.courier_wh_matrix(f)


@router.get("/top-pincodes", summary="Top pincodes by RTO volume")
def top_pincodes(
    limit: int = Query(10, ge=1, le=200),
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> list[dict]:
    return svc.top_pincodes(f, limit=limit)


@router.get("/delivery-day-distribution", summary="Ordered → delivered day histogram (D0..D5+)")
def delivery_day_distribution(
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> list[dict]:
    return svc.delivery_day_distribution(f)


# ============================================== Trend chart
@router.get("/trend", summary="Trend chart driven by segment + metric + granularity")
def trend(
    segment: str = Query("overall", description="overall | warehouse | courier | payment | daytype"),
    metric: str = Query("rto", description="rto | orders | eta | ndr | delivered_revenue"),
    granularity: str = Query("MoM", description="DoD | WoW | MoM"),
    sub_filter: str | None = Query(None, description="Specific segment value, or 'all' for overlay"),
    f: SupplyChainFilters = Depends(_filters),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    return svc.trend(f, segment=segment, metric=metric, granularity=granularity, sub_filter=sub_filter)


# ============================================== Sub-pill options
@router.get("/segment-options", summary="Distinct values for a segment (warehouse / courier / payment / daytype)")
def segment_options(
    segment: str | None = Query(None, description="Omit to get options for all segments"),
    svc: SupplyChainService = Depends(_service),
) -> dict:
    if segment:
        if segment not in SEGMENT_COLUMNS:
            return {"segment": segment, "options": []}
        return {"segment": segment, "options": svc.segment_options(segment)}
    return svc.all_segment_options()


# ============================================== AI summary
@router.get("/ai-summary", summary="AI summary for the most recent day. Cached 24h.")
def ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str | None]:
    svc = SupplyChainService(settings)
    latest = svc.get_latest_date()
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
        result = agent.ask(prompt)
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
