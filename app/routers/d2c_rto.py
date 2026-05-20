"""D2C RTO endpoints."""
import asyncio
import logging
from datetime import date
from functools import lru_cache

from fastapi import APIRouter, Depends, Query

from app.config import Settings, get_settings
from app.deps import get_agent_service
from app.routers.auth import get_current_user
from app.services.agent_service import AgentService
from app.services.d2c_rto_service import D2CRtoFilters, D2CRtoService

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
    start_date: date = Query(...),
    end_date: date = Query(...),
    payment: str | None = Query(None),
    customer: str | None = Query(None),
    compare_mode: str = Query("MoM"),
) -> dict:
    service = _service()
    filters = D2CRtoFilters(
        start_date=start_date,
        end_date=end_date,
        payment=payment,
        customer=customer,
        compare_mode=compare_mode,
    )

    # Fetch all sections in parallel — no sequential blocking
    overview, payment_split, by_tier, top_pincodes = await asyncio.gather(
        asyncio.to_thread(service.overview, filters),
        asyncio.to_thread(service.payment_split, filters),
        asyncio.to_thread(service.by_tier, filters),
        asyncio.to_thread(service.top_pincodes, filters),
    )

    return {
        "overview":         overview,
        "payment_split":    payment_split,
        "by_tier":          by_tier,
        "top_pincodes":     top_pincodes,
        # Derived from already-fetched data — no extra BQ calls
        "payment_insights": _payment_insights(payment_split),
        "recommendations":  _recommendations(top_pincodes, payment_split, by_tier),
    }


@router.get("/ai-summary", summary="AI summary for D2C RTO")
async def d2c_rto_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    service = _service()

    latest_date = await asyncio.to_thread(service.get_latest_date)
    if not latest_date:
        return {"summary": "No data available", "date": None}

    cache_key = f"d2c_rto_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached

    prompt = f"""Generate a brief 3-4 sentence executive summary of D2C RTO performance for {latest_date.isoformat()}.
Use ONLY: `innovist-master-data.shopify.v_clickpost_by_shopify`
Focus on RTO %, COD vs Prepaid RTO, top pincodes, and total RTO vs delivered orders.
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
        logger.exception("D2C RTO AI summary failed")
        return {"summary": f"Could not generate: {exc}", "date": latest_date.isoformat()}


# ------------------------------------------------------------------ pure helpers
# These receive already-fetched data and do no I/O — safe to call synchronously.

def _payment_insights(payment_split: list[dict]) -> dict:
    cod_data     = next((s for s in payment_split if s["payment"].upper() == "COD"),     None)
    prepaid_data = next((s for s in payment_split if s["payment"].upper() == "PREPAID"), None)

    if not cod_data or not prepaid_data:
        return {"cod_share": 0, "projected_rto_pct": 0, "annual_savings": 0}

    total_orders     = cod_data["orders"] + prepaid_data["orders"]
    cod_share        = cod_data["orders"] / total_orders if total_orders else 0
    target_cod_share = 0.45

    new_cod      = total_orders * target_cod_share
    new_prepaid  = total_orders * (1 - target_cod_share)
    projected    = (new_cod * cod_data["rto_pct"] + new_prepaid * prepaid_data["rto_pct"]) / total_orders if total_orders else 0

    return {"cod_share": cod_share, "projected_rto_pct": projected, "annual_savings": 0}


def _recommendations(
    top_pincodes: list[dict],
    payment_split: list[dict],
    by_tier: list[dict],
) -> list[dict]:
    recs = []

    # 1. Top RTO pincodes
    problematic = [p for p in top_pincodes if p["rto_pct"] > 0.20][:4]
    if problematic:
        locations    = ", ".join(f"{p['location']} ({_pct(p['rto_pct'])})" for p in problematic[:3])
        loss_total   = sum(p.get("loss", 0) for p in problematic)
        avg_rto      = sum(p["rto_pct"] for p in problematic) / len(problematic)
        total_orders = sum(p["orders"] for p in problematic)
        recs.append({
            "savings":     f"~{_inr(loss_total * 12)}/yr saved",
            "title":       f"Block COD on top {len(problematic)} pincodes",
            "description": f"{locations}. {_pct(avg_rto)}+ RTO. {total_orders:,} orders = {_inr(loss_total)} loss this period.",
        })

    # 2. COD vs Prepaid
    cod     = next((s for s in payment_split if s["payment"].upper() == "COD"),     None)
    prepaid = next((s for s in payment_split if s["payment"].upper() == "PREPAID"), None)
    if cod and prepaid and cod["rto_pct"] > prepaid["rto_pct"] * 2:
        total    = cod["orders"] + prepaid["orders"]
        cod_share = cod["orders"] / total if total else 0
        shift    = cod["orders"] * 0.15
        saved_orders = shift * (cod["rto_pct"] - prepaid["rto_pct"])
        recs.append({
            "savings":     f"~{_inr(saved_orders * 200 * 12)}/yr saved",
            "title":       "Force prepaid above ₹600",
            "description": (
                f"COD RTO {_pct(cod['rto_pct'])} vs Prepaid {_pct(prepaid['rto_pct'])}. "
                f"COD share {_pct(cod_share)}. Push prepaid discounts to shift volume."
            ),
        })

    # 3. Worst tier
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
