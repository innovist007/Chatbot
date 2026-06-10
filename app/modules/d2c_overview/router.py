"""D2C Overview — aggregated endpoint that gathers KPIs from multiple modules.

Combines: Meta Ads (v_meta_spends_table) + Retention (v_customer_dim / v_cohort_cac)
          + Supply Chain (shipment table) + Web CR + App CR
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import date, datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, Query

from app.config import ANALYTICS_TTL, CACHE_V, get_settings
from app.deps import get_agent_service
from app.modules.auth.router import get_current_user
from app.services.agent_service import AgentService

# ── Module imports (new canonical locations) ────────────────────────────────
from app.modules.acquisition.tabs.meta_ads.filters import MetaAdsFilters
from app.modules.acquisition.tabs.meta_ads.service import MetaAdsService
from app.modules.retention.filters import RetentionFilters
from app.modules.retention.service import RetentionService
from app.modules.supply_chain.service import SupplyChainFilters, SupplyChainService
from app.modules.web_cr.filters import WebCRFilters
from app.modules.web_cr.service import WebCRService
from app.modules.app_cr.service import AppCRFilters, AppCRService
from app.modules.d2c_overview.service import D2CSalesAdsService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/d2c-overview",
    tags=["d2c_overview"],
    dependencies=[Depends(get_current_user)],
)


@lru_cache
def _meta_svc() -> MetaAdsService:
    return MetaAdsService(get_settings())


@lru_cache
def _ret_svc() -> RetentionService:
    return RetentionService(get_settings())


@lru_cache
def _sc_svc() -> SupplyChainService:
    return SupplyChainService(get_settings())


@lru_cache
def _web_cr_svc() -> WebCRService:
    return WebCRService(get_settings())


@lru_cache
def _app_cr_svc() -> AppCRService:
    return AppCRService(get_settings())


@lru_cache
def _sales_ads_svc() -> D2CSalesAdsService:
    return D2CSalesAdsService(get_settings())


def _prev_dates(start: date, end: date, compare_start: date | None, compare_end: date | None):
    if compare_start and compare_end:
        return compare_start, compare_end
    n = (end - start).days + 1
    return start - timedelta(days=n), end - timedelta(days=n)


@router.get("/test-sales-ads")
async def test_sales_ads(
    start_date: date = Query(...),
    end_date:   date = Query(...),
) -> dict[str, Any]:
    """Debug: run the v_d2c_sales_ads query directly and surface any error."""
    svc = _sales_ads_svc()
    try:
        result = await asyncio.to_thread(svc.kpis, start_date, end_date)
        return {"ok": True, "data": result}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "type": type(exc).__name__}


@router.get("/pnl-trend")
async def get_pnl_trend(
    start_date:  date = Query(...),
    end_date:    date = Query(...),
    granularity: str  = Query("month"),
) -> list[dict[str, Any]]:
    """P&L trend from v_order_fact — all dimension combos; frontend filters."""
    f = RetentionFilters(start_date=start_date, end_date=end_date)
    return await asyncio.to_thread(_ret_svc().pnl_trend, f, granularity)


def _overview_cache_key(start_date, end_date, compare_start, compare_end) -> str:
    parts = [
        start_date.isoformat(),
        end_date.isoformat(),
        compare_start.isoformat() if compare_start else "",
        compare_end.isoformat()   if compare_end   else "",
    ]
    h = hashlib.md5("|".join(parts).encode()).hexdigest()[:12]
    return f"d2c_overview:{CACHE_V}:{h}"


@router.get("/data")
async def get_d2c_overview(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:

    meta_svc  = _meta_svc()
    cache_key = _overview_cache_key(start_date, end_date, compare_start, compare_end)
    if meta_svc.redis_client:
        try:
            raw = meta_svc.redis_client.get(cache_key)
            if raw:
                logger.debug("d2c-overview cache HIT: %s", cache_key)
                return json.loads(raw)
        except Exception:
            pass

    prev_s, prev_e = _prev_dates(start_date, end_date, compare_start, compare_end)

    ret_svc = _ret_svc()
    sc_svc  = _sc_svc()

    meta_f      = MetaAdsFilters(start_date=start_date, end_date=end_date)
    meta_prev_f = MetaAdsFilters(start_date=prev_s,     end_date=prev_e)
    ret_f       = RetentionFilters(start_date=start_date, end_date=end_date)
    sc_f        = SupplyChainFilters(
                      start_date=start_date, end_date=end_date,
                      compare_start=compare_start, compare_end=compare_end,
                  )
    web_f = WebCRFilters(start_date=start_date, end_date=end_date)
    app_f = AppCRFilters(start_date=start_date, end_date=end_date)

    async def safe(coro, label: str, fallback=None):
        try:
            return await coro
        except Exception as exc:
            logger.warning("d2c-overview: %s failed — %s", label, exc)
            return fallback

    (
        meta_kpis, meta_prev_kpis, meta_trend_mom, pnl_trend, waterfall,
        ret_key_metrics, ltv_cac, cohort_heatmap,
        sc_kpis, sc_rto_trend, courier_split,
        web_cr_trend, app_cr_trend,
        sales_ads_kpis, sales_ads_prev_kpis,
    ) = await asyncio.gather(
        safe(asyncio.to_thread(meta_svc._agg_row_full,    meta_f),      "meta_kpis",     {}),
        safe(asyncio.to_thread(meta_svc._agg_row_full,    meta_prev_f), "meta_prev_kpis",{}),
        safe(asyncio.to_thread(meta_svc.daily_trend,      meta_f, "month"), "meta_trend", []),
        safe(asyncio.to_thread(ret_svc.pnl_trend,         ret_f, "month"),  "pnl_trend",  []),
        safe(asyncio.to_thread(meta_svc.waterfall,        meta_f),      "waterfall",     {}),
        safe(asyncio.to_thread(ret_svc.key_metrics,       ret_f),       "ret_key_metrics",{}),
        safe(asyncio.to_thread(ret_svc.ltv_cac_trend,     ret_f),       "ltv_cac",       []),
        safe(asyncio.to_thread(ret_svc.cohort_heatmap,    ret_f),       "cohort_heatmap",[]),
        safe(asyncio.to_thread(sc_svc._kpi_aggregates,    sc_f),        "sc_kpis",       {}),
        safe(asyncio.to_thread(sc_svc.trend, sc_f, "overall", "rto", "MoM", None), "sc_rto_trend", {}),
        safe(asyncio.to_thread(sc_svc.courier_table,      sc_f),        "courier_split", []),
        safe(asyncio.to_thread(_web_cr_svc().cr_trend,    web_f),       "web_cr_trend",  []),
        safe(asyncio.to_thread(_app_cr_svc().filtered_trend, app_f, "month", "All", "All"), "app_cr_trend", []),
        safe(asyncio.to_thread(_sales_ads_svc().kpis, start_date, end_date),    "sales_ads_kpis",      {}),
        safe(asyncio.to_thread(_sales_ads_svc().kpis, prev_s,    prev_e),       "sales_ads_prev_kpis", {}),
    )

    def delta(curr, prev, key):
        c = curr.get(key) or 0
        p = prev.get(key) or 0
        return (c - p) / p if p != 0 else None

    delta_keys = [
        "delivered_rev", "cm2", "cm2_pct", "disc_pct", "rto_pct",
        "spend", "aov", "mrp_revenue", "new_customers", "meta_roas",
        "units_sold", "avg_selling_price",
    ]
    meta_deltas = {k: delta(meta_kpis, meta_prev_kpis, k) for k in delta_keys}

    sa_delta_keys = [
        "net_revenue", "mrp_revenue", "total_spend", "cm2", "cm2_pct",
        "discount_pct", "asp", "aov", "total_units", "total_orders",
        "true_cm_per_order", "spend_per_order",
    ]
    sa_deltas = {k: delta(sales_ads_kpis or {}, sales_ads_prev_kpis or {}, k) for k in sa_delta_keys}

    result = {
        "meta": {
            "current":  meta_kpis,
            "previous": meta_prev_kpis,
            "deltas":   meta_deltas,
            "trend":    meta_trend_mom,
        },
        "pnl_trend":    pnl_trend,
        "waterfall":    waterfall,
        "retention":    {
            "key_metrics":    ret_key_metrics,
            "ltv_cac":        ltv_cac,
            "cohort_heatmap": cohort_heatmap,
        },
        "supply_chain":  sc_kpis,
        "sc_rto_trend":  sc_rto_trend,
        "courier_split": courier_split,
        "web_cr_trend":  web_cr_trend,
        "app_cr_trend":  app_cr_trend,
        "sales_ads": {
            "current": sales_ads_kpis  or {},
            "previous": sales_ads_prev_kpis or {},
            "deltas":  sa_deltas,
        },
        "period": {
            "start":      start_date.isoformat(),
            "end":        end_date.isoformat(),
            "prev_start": prev_s.isoformat(),
            "prev_end":   prev_e.isoformat(),
        },
    }

    if meta_svc.redis_client:
        try:
            meta_svc.redis_client.setex(cache_key, ANALYTICS_TTL, json.dumps(result, default=str))
            logger.debug("d2c-overview cache SET: %s", cache_key)
        except Exception:
            pass

    return result


# ── Split sub-endpoints (progressive rendering) ─────────────────────────────

@router.get("/kpis")
async def get_kpis(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:
    """Sales-ads KPIs — Business Health + Unit Economics. Fastest section."""
    prev_s, prev_e = _prev_dates(start_date, end_date, compare_start, compare_end)

    def delta(curr, prev, key):
        c = (curr or {}).get(key) or 0
        p = (prev or {}).get(key) or 0
        return (c - p) / p if p != 0 else None

    sa_delta_keys = [
        "net_revenue", "mrp_revenue", "total_spend", "cm2", "cm2_pct",
        "discount_pct", "asp", "aov", "total_units", "total_orders",
        "true_cm_per_order", "spend_per_order",
    ]

    curr, prev = await asyncio.gather(
        asyncio.to_thread(_sales_ads_svc().kpis, start_date, end_date),
        asyncio.to_thread(_sales_ads_svc().kpis, prev_s, prev_e),
    )
    return {
        "current":  curr or {},
        "previous": prev or {},
        "deltas":   {k: delta(curr, prev, k) for k in sa_delta_keys},
    }


@router.get("/meta-summary")
async def get_meta_summary(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:
    """Meta KPIs + trend + waterfall. Used by P&L trend chart and acquisition."""
    prev_s, prev_e = _prev_dates(start_date, end_date, compare_start, compare_end)
    meta_svc = _meta_svc()
    meta_f      = MetaAdsFilters(start_date=start_date, end_date=end_date)
    meta_prev_f = MetaAdsFilters(start_date=prev_s,     end_date=prev_e)

    async def safe(coro, fallback=None):
        try:
            return await coro
        except Exception as exc:
            logger.warning("meta-summary: %s", exc)
            return fallback

    curr, prev, trend, waterfall = await asyncio.gather(
        safe(asyncio.to_thread(meta_svc._agg_row_full, meta_f),           {}),
        safe(asyncio.to_thread(meta_svc._agg_row_full, meta_prev_f),      {}),
        safe(asyncio.to_thread(meta_svc.daily_trend,   meta_f, "month"),  []),
        safe(asyncio.to_thread(meta_svc.waterfall,     meta_f),           {}),
    )

    def delta(c, p, key):
        cv = (c or {}).get(key) or 0
        pv = (p or {}).get(key) or 0
        return (cv - pv) / pv if pv != 0 else None

    delta_keys = [
        "delivered_rev", "cm2", "cm2_pct", "disc_pct", "rto_pct",
        "spend", "aov", "mrp_revenue", "new_customers", "units_sold",
    ]
    return {
        "meta": {
            "current":  curr or {},
            "previous": prev or {},
            "deltas":   {k: delta(curr, prev, k) for k in delta_keys},
            "trend":    trend,
        },
        "waterfall": waterfall,
    }


@router.get("/retention-summary")
async def get_retention_summary(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:
    """Retention KPIs — key metrics, LTV/CAC, cohort heatmap, P&L trend."""
    ret_svc = _ret_svc()
    ret_f = RetentionFilters(start_date=start_date, end_date=end_date)

    async def safe(coro, fallback=None):
        try:
            return await coro
        except Exception as exc:
            logger.warning("retention-summary: %s", exc)
            return fallback

    key_metrics, ltv_cac, cohort_heatmap, pnl_trend = await asyncio.gather(
        safe(asyncio.to_thread(ret_svc.key_metrics,    ret_f),         {}),
        safe(asyncio.to_thread(ret_svc.ltv_cac_trend,  ret_f),         []),
        safe(asyncio.to_thread(ret_svc.cohort_heatmap, ret_f),         []),
        safe(asyncio.to_thread(ret_svc.pnl_trend,      ret_f, "month"),[]),
    )
    return {
        "key_metrics":    key_metrics,
        "ltv_cac":        ltv_cac,
        "cohort_heatmap": cohort_heatmap,
        "pnl_trend":      pnl_trend,
    }


@router.get("/supply-summary")
async def get_supply_summary(
    start_date:    date = Query(...),
    end_date:      date = Query(...),
    compare_start: date | None = Query(None),
    compare_end:   date | None = Query(None),
) -> dict[str, Any]:
    """Supply chain KPIs + RTO trend + courier split + Web/App CR trends."""
    sc_svc = _sc_svc()
    sc_f = SupplyChainFilters(
        start_date=start_date, end_date=end_date,
        compare_start=compare_start, compare_end=compare_end,
    )
    web_f = WebCRFilters(start_date=start_date, end_date=end_date)
    app_f = AppCRFilters(start_date=start_date, end_date=end_date)

    async def safe(coro, fallback=None):
        try:
            return await coro
        except Exception as exc:
            logger.warning("supply-summary: %s", exc)
            return fallback

    sc_kpis, sc_rto_trend, courier_split, web_cr_trend, app_cr_trend = await asyncio.gather(
        safe(asyncio.to_thread(sc_svc._kpi_aggregates, sc_f),                              {}),
        safe(asyncio.to_thread(sc_svc.trend, sc_f, "overall", "rto", "MoM", None),         {}),
        safe(asyncio.to_thread(sc_svc.courier_table,   sc_f),                              []),
        safe(asyncio.to_thread(_web_cr_svc().cr_trend, web_f),                             []),
        safe(asyncio.to_thread(_app_cr_svc().filtered_trend, app_f, "month", "All", "All"),[]),
    )
    return {
        "supply_chain":  sc_kpis,
        "sc_rto_trend":  sc_rto_trend,
        "courier_split": courier_split,
        "web_cr_trend":  web_cr_trend,
        "app_cr_trend":  app_cr_trend,
    }


# ── AI Summary ──────────────────────────────────────────────────────────────

def _build_overview_prompt(redis_client, data_date: str, slot_date: str) -> str:
    # data_date: the day the flash describes (previous day).
    # slot_date: the daily cache slot (today) under which peer-tab summaries are
    #            written by the warm-summaries cron — used only to look them up.
    kpi_context = ""
    if redis_client:
        try:
            keys = redis_client.keys(f"d2c_overview:{CACHE_V}:*")
            if keys:
                raw = redis_client.get(keys[0])
                if raw:
                    data = json.loads(raw)
                    meta = data.get("meta", {}).get("current", {})
                    ret  = data.get("retention", {}).get("key_metrics", {})
                    sc   = data.get("supply_chain", {})

                    def f(v, prefix="₹"):
                        if v is None: return "N/A"
                        if abs(v) >= 1e7:  return f"{prefix}{v/1e7:.1f}Cr"
                        if abs(v) >= 1e5:  return f"{prefix}{v/1e5:.1f}L"
                        return f"{prefix}{round(v):,}"

                    kpi_context = f"""
KEY METRICS (latest cached period):
  Net Revenue        : {f(meta.get('delivered_rev'))}
  MRP Revenue        : {f(meta.get('mrp_revenue'))}
  CM2                : {f(meta.get('cm2'))} ({round((meta.get('cm2_pct') or 0)*100, 1)}% of net rev)
  Marketing Spend    : {f(meta.get('spend'))} ({round((meta.get('spend') or 0)/(meta.get('delivered_rev') or 1)*100, 1)}% of net)
  RTO Rate           : {round((meta.get('rto_pct') or 0)*100, 1)}%
  Discount %         : {round((meta.get('disc_pct') or 0)*100, 1)}%
  Meta ROAS          : {round(meta.get('shopify_roas_pre') or 0, 2)}×
  New Customers      : {meta.get('new_customers', 'N/A')}
  AOV                : {f(meta.get('aov'))}
  Repeat Rate (30d)  : {round(ret.get('repeat_rate_30d') or 0, 1)}%
  LTV 90d            : {f(ret.get('realized_ltv_90d'))}
  Avg Orders/Cust    : {round(ret.get('avg_order_frequency') or 0, 2)}×
  CAC Payback        : {round(ret.get('cac_payback_days') or 0, 0)} days
  RTO (shipment)     : {round((sc.get('rto_pct') or 0)*100, 1)}%
  SLA Breach         : {round((1 - (sc.get('in_eta_pct') or 1))*100, 1)}%
"""
        except Exception as exc:
            logger.debug("Could not load KPI context: %s", exc)

    tab_summaries = []
    if redis_client:
        # Key shapes MUST match what the writers store: <module>:ai_summary:<slot>
        # (the warm-summaries cron writes these under today's slot).
        tab_keys = {
            "Web CR":    f"webcr:ai_summary:{slot_date}",
            "App CR":    f"appcr:ai_summary:{slot_date}",
            "Retention": f"retention:ai_summary:{slot_date}",
        }
        for tab_name, key in tab_keys.items():
            try:
                raw = redis_client.get(key)
                if raw:
                    parsed       = json.loads(raw)
                    summary_text = parsed.get("summary") if isinstance(parsed, dict) else str(parsed)
                    if summary_text and summary_text != "pending":
                        tab_summaries.append(f"  {tab_name}: {summary_text[:300]}")
            except Exception:
                pass

    tab_context = ""
    if tab_summaries:
        tab_context = "\nTAB INSIGHTS (from individual dashboards):\n" + "\n".join(tab_summaries)

    return f"""You are writing the executive daily flash for a D2C brand dashboard ({data_date}).
Write exactly 4 sentences — no bullets, no headers, plain text only.
Sentence 1: Revenue & P&L health (net rev, CM2, discount, spend efficiency).
Sentence 2: Acquisition performance (new customers, ROAS, CAC trend).
Sentence 3: Retention & customer quality (repeat rate, LTV, cohort trend).
Sentence 4: One urgent action item with specific number.
{kpi_context}{tab_context}
Return plain text only."""


@router.get("/ai-summary/stream", summary="D2C Overview AI summary — SSE stream")
async def d2c_overview_ai_summary_stream(
    agent: AgentService = Depends(get_agent_service),
):
    from app.services.ai_summary_service import stream_or_deliver
    from sse_starlette.sse import EventSourceResponse
    redis_client = _meta_svc().redis_client
    # Match the warm-summaries cron: cache slot keyed on today (IST), content
    # for the previous day, peer summaries looked up under today's slot.
    ist_today = datetime.now(IST).date()
    slot      = ist_today.isoformat()
    data_date = (ist_today - timedelta(days=1)).isoformat()
    cache_key = f"d2c_overview:ai_summary:{slot}"
    prompt    = _build_overview_prompt(redis_client, data_date, slot)
    return EventSourceResponse(
        stream_or_deliver(redis_client, cache_key, prompt, data_date, agent),
        headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
    )
