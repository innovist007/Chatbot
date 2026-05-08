"""D2C RTO endpoints."""
import logging
from datetime import date, timedelta

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


@router.get("/overview", summary="D2C RTO overview")
def d2c_rto_overview(
    start_date: date = Query(...),
    end_date: date = Query(...),
    payment: str | None = Query(None),
    customer: str | None = Query(None),
    compare_mode: str = Query("MoM"),
    settings: Settings = Depends(get_settings),
) -> dict:
    """Get D2C RTO overview with all sections."""
    service = D2CRtoService(settings)
    
    filters = D2CRtoFilters(
        start_date=start_date,
        end_date=end_date,
        payment=payment,
        customer=customer,
        compare_mode=compare_mode,
    )
    
    return {
        "overview": service.overview(filters),
        "payment_split": service.payment_split(filters),
        "by_tier": service.by_tier(filters),
        "top_pincodes": service.top_pincodes(filters),
        "payment_insights": _payment_insights(service, filters),
        "recommendations": _recommendations(service, filters),
    }


@router.get("/ai-summary", summary="AI summary for D2C RTO")
def d2c_rto_ai_summary(
    settings: Settings = Depends(get_settings),
    agent: AgentService = Depends(get_agent_service),
) -> dict[str, str]:
    """Generate AI summary for the most recent day. Cached 24h."""
    service = D2CRtoService(settings)
    
    latest_date = service.get_latest_date()
    if not latest_date:
        return {"summary": "No data available", "date": None}
    
    cache_key = f"d2c_rto_ai_summary:{latest_date.isoformat()}"
    cached = service._get_cache(cache_key)
    if cached:
        return cached
    
    prompt = f"""Generate a brief 3-4 sentence executive summary of D2C RTO (Return To Origin) performance for {latest_date.isoformat()}.

CRITICAL: Use ONLY data from this specific table:
`innovist-master-data.shopify.v_clickpost_by_shopify`

Focus on:
- RTO percentage (count where Shipment_status = 'RTO' / total orders)
- COD vs Prepaid RTO comparison
- Top problematic pincodes or tiers
- Total RTO orders vs delivered

IMPORTANT RULES:
- ONLY 3-4 sentences plain text
- NO charts, tables, SQL queries shown
- Just flowing prose with key insights
- Mention specific numbers and percentages"""

    try:
        result = agent.ask(prompt)
        response = {
            "summary": result.get("answer", "Unable to generate summary"),
            "date": latest_date.isoformat(),
        }
        service._set_cache(cache_key, response, ttl=86400)
        return response
    except Exception as exc:
        logger.exception("AI summary generation failed")
        return {
            "summary": f"Could not generate: {str(exc)}",
            "date": latest_date.isoformat() if latest_date else None,
        }


def _payment_insights(service: D2CRtoService, f: D2CRtoFilters) -> dict:
    """Calculate payment-related insights."""
    splits = service.payment_split(f)
    
    cod_data = next((s for s in splits if s["payment"].upper() == "COD"), None)
    prepaid_data = next((s for s in splits if s["payment"].upper() == "PREPAID"), None)
    
    if not cod_data or not prepaid_data:
        return {
            "cod_share": 0,
            "projected_rto_pct": 0,
            "annual_savings": 0,
        }
    
    total_orders = cod_data["orders"] + prepaid_data["orders"]
    cod_share = cod_data["orders"] / total_orders if total_orders else 0
    
    # Projected: if COD drops to 45%
    target_cod_share = 0.45
    new_cod_orders = total_orders * target_cod_share
    new_prepaid_orders = total_orders * (1 - target_cod_share)
    
    new_rto_orders = (new_cod_orders * cod_data["rto_pct"]) + (new_prepaid_orders * prepaid_data["rto_pct"])
    projected_rto_pct = new_rto_orders / total_orders if total_orders else 0
    
    # Estimate annual savings (rough placeholder until shipping cost data is available)
    annual_savings = 0
    
    return {
        "cod_share": cod_share,
        "projected_rto_pct": projected_rto_pct,
        "annual_savings": annual_savings,
    }


# def _recommendations(service: D2CRtoService, f: D2CRtoFilters) -> list[dict]:
#     """Generate top recommendations based on data."""
#     pincodes = service.top_pincodes(f, limit=4)
#     splits = service.payment_split(f)
    
#     recommendations = []
    
#     # Top pincodes recommendation
#     if pincodes:
#         top_4 = pincodes[:4]
#         locations = ", ".join([p["location"] for p in top_4 if p.get("location")])
#         avg_rto = sum(p["rto_pct"] for p in top_4) / len(top_4) if top_4 else 0
#         recommendations.append({
#             "savings": "High impact",
#             "title": f"Block COD on top {len(top_4)} pincodes",
#             "description": f"{locations}. {(avg_rto * 100):.0f}%+ RTO rate. Significant loss reduction with minimal volume impact.",
#         })
    
#     # COD recommendation
#     cod_data = next((s for s in splits if s["payment"].upper() == "COD"), None)
#     if cod_data and cod_data["rto_pct"] > 0.1:
#         recommendations.append({
#             "savings": "Medium-High impact",
#             "title": "Force prepaid above ₹600",
#             "description": f"COD RTO is {(cod_data['rto_pct'] * 100):.1f}%. Push prepaid discount instead of COD for high-value orders.",
#         })
    
#     # Tier 3-4 recommendation
#     recommendations.append({
#         "savings": "Medium impact",
#         "title": "Reroute Tier 3/4 to better couriers",
#         "description": "Lower-tier pincodes have 2x higher RTO. Switch to couriers with better rural performance.",
#     })
    
#     return recommendations


def _recommendations(service: D2CRtoService, f: D2CRtoFilters) -> list[dict]:
    """Generate dynamic recommendations based on actual data."""
    pincodes = service.top_pincodes(f, limit=10)
    splits = service.payment_split(f)
    tiers = service.by_tier(f)
    
    recommendations = []
    
    # ============ Recommendation 1: Top RTO Pincodes ============
    if pincodes:
        # Get top pincodes with worst RTO
        top_problematic = [p for p in pincodes if p["rto_pct"] > 0.20][:4]
        
        if top_problematic:
            locations = ", ".join([
                f"{p['location']} ({fmt_pct(p['rto_pct'])})" 
                for p in top_problematic[:3]
            ])
            
            total_rto_value = sum(p.get("loss", 0) for p in top_problematic)
            total_orders = sum(p["orders"] for p in top_problematic)
            avg_rto = sum(p["rto_pct"] for p in top_problematic) / len(top_problematic)
            
            # Annual estimate (assuming current period is monthly)
            annual_savings = total_rto_value * 12
            
            recommendations.append({
                "savings": f"~{fmt_inr(annual_savings)}/yr saved",
                "title": f"Block COD on top {len(top_problematic)} pincodes",
                "description": (
                    f"{locations}. {fmt_pct(avg_rto)}+ RTO. "
                    f"{total_orders:,} orders = {fmt_inr(total_rto_value)} loss in this period."
                ),
            })
    
    # ============ Recommendation 2: COD vs Prepaid ============
    cod_data = next((s for s in splits if s["payment"].upper() == "COD"), None)
    prepaid_data = next((s for s in splits if s["payment"].upper() == "PREPAID"), None)
    
    if cod_data and prepaid_data and cod_data["rto_pct"] > prepaid_data["rto_pct"] * 2:
        total_orders = cod_data["orders"] + prepaid_data["orders"]
        cod_share = cod_data["orders"] / total_orders if total_orders else 0
        
        # Calculate potential savings if shifting 15% from COD to Prepaid
        shift_orders = cod_data["orders"] * 0.15
        rto_saved = shift_orders * (cod_data["rto_pct"] - prepaid_data["rto_pct"])
        # Estimate ₹200 avg loss per RTO (placeholder)
        monthly_savings = rto_saved * 200
        annual_savings = monthly_savings * 12
        
        recommendations.append({
            "savings": f"~{fmt_inr(annual_savings)}/yr saved",
            "title": "Force prepaid above ₹600",
            "description": (
                f"COD RTO {fmt_pct(cod_data['rto_pct'])} vs Prepaid {fmt_pct(prepaid_data['rto_pct'])}. "
                f"COD share: {fmt_pct(cod_share)}. Push prepaid discounts to shift volume."
            ),
        })
    
    # ============ Recommendation 3: Tier-based ============
    if tiers:
        # Find tier with worst RTO
        worst_tier = max(tiers, key=lambda t: t["rto_pct"])
        best_tier = min(tiers, key=lambda t: t["rto_pct"])
        
        if worst_tier and best_tier and worst_tier["tier"] != best_tier["tier"]:
            ratio = worst_tier["rto_pct"] / max(best_tier["rto_pct"], 0.001)
            
            if ratio > 1.5:
                # Estimate savings from improving worst tier RTO
                potential_rto_reduction = worst_tier["orders"] * (worst_tier["rto_pct"] - best_tier["rto_pct"]) * 0.3
                monthly_savings = potential_rto_reduction * 200  # ₹200 avg
                annual_savings = monthly_savings * 12
                
                recommendations.append({
                    "savings": f"~{fmt_inr(annual_savings)}/yr saved",
                    "title": f"Optimize courier for {worst_tier['tier']}",
                    "description": (
                        f"{worst_tier['tier']} has {fmt_pct(worst_tier['rto_pct'])} RTO ({ratio:.1f}x {best_tier['tier']}). "
                        f"{worst_tier['orders']:,} orders ({fmt_pct(worst_tier['mix_pct'])} of volume) - switch to better couriers."
                    ),
                })
    
    return recommendations[:3]  # Top 3 recommendations


def fmt_inr(value: float) -> str:
    """Format value as INR (₹)."""
    if value >= 10_000_000:  # 1 crore
        return f"₹{value / 10_000_000:.1f}Cr"
    elif value >= 100_000:  # 1 lakh
        return f"₹{value / 100_000:.1f}L"
    elif value >= 1000:
        return f"₹{value / 1000:.1f}K"
    return f"₹{value:.0f}"


def fmt_pct(value: float) -> str:
    """Format value as percentage."""
    return f"{value * 100:.1f}%"