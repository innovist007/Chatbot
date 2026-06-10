"""D2C RTO endpoints."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, Query

from app.config import ai_summary_dates, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService
from app.modules.d2c_rto.service import D2CRtoFilters, D2CRtoService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/d2c-rto",
    tags=["d2c-rto"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _service() -> D2CRtoService:
    return D2CRtoService(get_settings())


@router.get("/overview", summary="D2C RTO overview")
async def d2c_rto_overview(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    payment:       str | None = Query(None),
    customer:      str | None = Query(None),
    compare_mode:  str = Query("MoM"),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict:
    service = _service()
    filters = D2CRtoFilters(
        start_date=start_date, end_date=end_date,
        payment=payment, customer=customer,
        compare_mode=compare_mode,
        compare_start=compare_start, compare_end=compare_end,
    )
    overview, payment_split, by_tier, top_pincodes = await asyncio.gather(
        asyncio.to_thread(service.overview,       filters),
        asyncio.to_thread(service.payment_split,  filters),
        asyncio.to_thread(service.by_tier,        filters),
        asyncio.to_thread(service.top_pincodes,   filters),
    )
    return {
        "overview":         overview,
        "payment_split":    payment_split,
        "by_tier":          by_tier,
        "top_pincodes":     top_pincodes,
        "payment_insights": _payment_insights(payment_split),
        "recommendations":  _recommendations(top_pincodes, payment_split, by_tier),
    }


@router.get("/ai-summary/stream", summary="AI summary — SSE stream. Pushes one JSON event when ready.")
async def d2c_rto_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    service     = _service()
    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        async def _no_data():
            import json
            yield {"data": json.dumps({"summary": "No data available", "date": None})}
        return EventSourceResponse(_no_data(), headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"})
    slot, data_date = ai_summary_dates()   # key on today (matches cron), display yesterday
    cache_key    = f"d2crto:ai_summary:{slot}"
    redis_client = service.redis_client if service.cache_enabled else None
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, _rto_prompt(data_date), data_date, agent),
    )


def _rto_prompt(as_of: str) -> str:
    return f"""Generate a brief 3-4 sentence executive summary of D2C RTO performance for {as_of}.
Use ONLY: `innovist-master-data.shopify.v_clickpost_by_shopify`
Focus on RTO %, COD vs Prepaid RTO, top pincodes, and total RTO vs delivered orders.
Return ONLY 3-4 sentences of plain text — no charts, no SQL, no bullets."""


# ------------------------------------------------------------------ pure helpers

def _payment_insights(payment_split: list[dict]) -> dict:
    cod_data     = next((s for s in payment_split if s["payment"].upper() == "COD"),     None)
    prepaid_data = next((s for s in payment_split if s["payment"].upper() == "PREPAID"), None)

    if not cod_data or not prepaid_data:
        return {"cod_share": 0, "projected_rto_pct": 0, "annual_savings": 0}

    total_orders     = cod_data["orders"] + prepaid_data["orders"]
    cod_share        = cod_data["orders"] / total_orders if total_orders else 0
    target_cod_share = 0.45
    new_cod          = total_orders * target_cod_share
    new_prepaid      = total_orders * (1 - target_cod_share)
    projected        = (new_cod * cod_data["rto_pct"] + new_prepaid * prepaid_data["rto_pct"]) / total_orders if total_orders else 0
    return {"cod_share": cod_share, "projected_rto_pct": projected, "annual_savings": 0}


def _recommendations(
    top_pincodes: list[dict],
    payment_split: list[dict],
    by_tier: list[dict],
) -> list[dict]:
    recs = []

    problematic = [p for p in top_pincodes if p["rto_pct"] > 0.20][:4]
    if problematic:
        locations  = ", ".join(f"{p['location']} ({_pct(p['rto_pct'])})" for p in problematic[:3])
        loss_total = sum(p.get("loss", 0) for p in problematic)
        avg_rto    = sum(p["rto_pct"] for p in problematic) / len(problematic)
        total_ord  = sum(p["orders"] for p in problematic)
        recs.append({
            "savings":     f"~{_inr(loss_total * 12)}/yr saved",
            "title":       f"Block COD on top {len(problematic)} pincodes",
            "description": f"{locations}. {_pct(avg_rto)}+ RTO. {total_ord:,} orders = {_inr(loss_total)} loss this period.",
        })

    cod     = next((s for s in payment_split if s["payment"].upper() == "COD"),     None)
    prepaid = next((s for s in payment_split if s["payment"].upper() == "PREPAID"), None)
    if cod and prepaid and cod["rto_pct"] > prepaid["rto_pct"] * 2:
        total     = cod["orders"] + prepaid["orders"]
        cod_share = cod["orders"] / total if total else 0
        shift     = cod["orders"] * 0.15
        saved_ord = shift * (cod["rto_pct"] - prepaid["rto_pct"])
        recs.append({
            "savings":     f"~{_inr(saved_ord * 200 * 12)}/yr saved",
            "title":       "Force prepaid above ₹600",
            "description": (
                f"COD RTO {_pct(cod['rto_pct'])} vs Prepaid {_pct(prepaid['rto_pct'])}. "
                f"COD share {_pct(cod_share)}. Push prepaid discounts to shift volume."
            ),
        })

    if len(by_tier) >= 2:
        worst = max(by_tier, key=lambda t: t["rto_pct"])
        best  = min(by_tier, key=lambda t: t["rto_pct"])
        ratio = worst["rto_pct"] / max(best["rto_pct"], 0.001)
        if ratio > 1.5:
            potential = worst["orders"] * (worst["rto_pct"] - best["rto_pct"]) * 0.3
            recs.append({
                "savings":     f"~{_inr(potential * 200 * 12)}/yr saved",
                "title":       f"Optimize courier for {worst['tier']}",
                "description": (
                    f"{worst['tier']} has {_pct(worst['rto_pct'])} RTO ({ratio:.1f}x {best['tier']}). "
                    f"{worst['orders']:,} orders — switch to better-performing couriers."
                ),
            })

    return recs[:3]


def _inr(v: float) -> str:
    if v >= 10_000_000: return f"₹{v/10_000_000:.1f}Cr"
    if v >= 100_000:    return f"₹{v/100_000:.1f}L"
    if v >= 1_000:      return f"₹{v/1_000:.1f}K"
    return f"₹{v:.0f}"


def _pct(v: float) -> str:
    return f"{v * 100:.1f}%"
