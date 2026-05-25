"""Meta Ads analytics service.

Source: `innovist-master-data.shopify.v_meta_spends_table`

P&L formulas:
  Gross Revenue    = SUM(shopify_revenue)
  RTO Revenue      = SUM(rto_revenue)
  Revenue after RTO = Gross - RTO  [= SUM(delivered_revenue)]
  COGS             = SUM(cogs_amount)
  CM1              = Revenue after RTO - COGS - SUM(logistic_amount)
  Spends           = SUM(meta_spends)
  CM2              = CM1 - Spends
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

import redis
from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)

TABLE = "`innovist-master-data.shopify.v_meta_spends_table`"

GRANULARITY_TRUNC = {
    "day":   "DAY",
    "week":  "WEEK(MONDAY)",
    "month": "MONTH",
}

# ------------------------------------------------------------------ benchmarks
BENCHMARKS = {
    "ctr":        0.023,   # 2.3%
    "lp_load":    0.85,    # 85% LP load rate (15% bounce)
    "atc_rate":   0.18,    # 18%
    "cart_order": 0.50,    # 50% cart→order
}


@dataclass
class MetaAdsFilters:
    start_date: date
    end_date: date
    campaigns: list[str] | None = None
    stages: list[str] | None = None
    creative_types: list[str] | None = None
    brands: list[str] | None = None
    languages: list[str] | None = None
    ad_names: list[str] | None = None
    compare_start: date | None = None
    compare_end: date | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "MetaAdsFilters":
        if self.compare_start and self.compare_end:
            return replace(self, start_date=self.compare_start, end_date=self.compare_end)
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))

    def cache_key(self, prefix: str) -> str:
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            # Compare dates MUST be in the key — different comparison windows = different results
            self.compare_start.isoformat() if self.compare_start else "",
            self.compare_end.isoformat()   if self.compare_end   else "",
            ",".join(sorted(self.campaigns or [])),
            ",".join(sorted(self.stages or [])),
            ",".join(sorted(self.creative_types or [])),
            ",".join(sorted(self.brands or [])),
            ",".join(sorted(self.languages or [])),
            ",".join(sorted(self.ad_names or [])),
        ]
        key_hash = hashlib.md5("|".join(parts).encode()).hexdigest()[:12]
        return f"meta:{prefix}:{key_hash}"


class MetaAdsService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)

        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host, port=settings.redis_port, db=0,
                decode_responses=True, socket_connect_timeout=2,
            )
            self.redis_client.ping()
            self.cache_enabled = True
        except Exception as e:
            logger.warning(f"Redis unavailable for meta ads: {e}")
            self.redis_client = None
            self.cache_enabled = False

    # ------------------------------------------------------------------ cache
    def _get_cache(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            data = self.redis_client.get(key)
            return json.loads(data) if data else None
        except Exception:
            return None

    def _set_cache(self, key: str, value: Any, ttl: int = 3600) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
        except Exception:
            pass

    # ------------------------------------------------------------------ helpers
    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        cfg = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(sql, job_config=cfg).result()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    def _where(self, f: MetaAdsFilters) -> tuple[str, list]:
        clauses = ["created_date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.campaigns:
            clauses.append("campaign_name IN UNNEST(@campaigns)")
            params.append(bigquery.ArrayQueryParameter("campaigns", "STRING", f.campaigns))
        if f.stages:
            clauses.append("stage IN UNNEST(@stages)")
            params.append(bigquery.ArrayQueryParameter("stages", "STRING", f.stages))
        if f.creative_types:
            clauses.append("creative_type IN UNNEST(@creative_types)")
            params.append(bigquery.ArrayQueryParameter("creative_types", "STRING", f.creative_types))
        if f.brands:
            clauses.append("brand IN UNNEST(@brands)")
            params.append(bigquery.ArrayQueryParameter("brands", "STRING", f.brands))
        if f.languages:
            clauses.append("language IN UNNEST(@languages)")
            params.append(bigquery.ArrayQueryParameter("languages", "STRING", f.languages))
        if f.ad_names:
            clauses.append("ad_name IN UNNEST(@ad_names)")
            params.append(bigquery.ArrayQueryParameter("ad_names", "STRING", f.ad_names))
        return " AND ".join(clauses), params

    @staticmethod
    def _sd(a: float | None, b: float | None) -> float | None:
        """Safe divide; returns None when denominator is zero/None."""
        if a is None or b is None or b == 0:
            return None
        return a / b

    def _agg_row_full(self, f: MetaAdsFilters) -> dict[str, Any]:
        """Full aggregation — all P&L components for KPI cards, waterfall, diagnostic."""
        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(SUM(meta_spends),          0) AS spend,
          COALESCE(SUM(shopify_revenue),       0) AS shopify_gross,
          COALESCE(SUM(rto_revenue),           0) AS rto_amount,
          COALESCE(SUM(delivered_revenue),     0) AS delivered_rev,
          COALESCE(SUM(meta_revenue),          0) AS meta_rev,
          COALESCE(SUM(ga_revenue),            0) AS ga_rev,
          COALESCE(SUM(cogs_amount),           0) AS cogs,
          COALESCE(SUM(logistic_amount),       0) AS logistics,
          COALESCE(SUM(discount_amount),       0) AS discount,
          COALESCE(SUM(shopify_orders),        0) AS orders,
          COALESCE(SUM(prepaid_orders),        0) AS prepaid_orders,
          COALESCE(SUM(rto_orders),            0) AS rto_orders,
          COALESCE(SUM(new_customers),         0) AS new_customers,
          COALESCE(SUM(repeat_30d_customers),  0) AS repeat_30d,
          COALESCE(SUM(impressions),           0) AS impressions,
          COALESCE(SUM(clicks),                0) AS clicks,
          COALESCE(SUM(reach),                 0) AS reach,
          COALESCE(SUM(ga_sessions),           0) AS ga_sessions,
          COALESCE(SUM(ga_atc),                0) AS ga_atc,
          COALESCE(SUM(ga_checkout),           0) AS ga_checkout,
          COALESCE(SUM(ltv_30d_value),         0) AS ltv_30d_total,
          -- CPM/CPC summed from pre-computed BQ columns; CTR derived from clicks/impressions
          COALESCE(SUM(cpm),                   0) AS cpm_col,
          COALESCE(SUM(cpc),                   0) AS cpc_col,
          AVG(frequency)                           AS frequency_avg,
          MAX(days_live)                           AS days_live_max
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        r = rows[0] if rows else {}

        sd = self._sd
        spend         = float(r.get("spend") or 0)
        shopify_gross = float(r.get("shopify_gross") or 0)
        rto_amount    = float(r.get("rto_amount") or 0)
        delivered_rev = float(r.get("delivered_rev") or 0)
        meta_rev      = float(r.get("meta_rev") or 0)
        ga_rev        = float(r.get("ga_rev") or 0)
        cogs          = float(r.get("cogs") or 0)
        logistics     = float(r.get("logistics") or 0)
        discount      = float(r.get("discount") or 0)
        orders        = float(r.get("orders") or 0)
        prepaid_ord   = float(r.get("prepaid_orders") or 0)
        rto_orders    = float(r.get("rto_orders") or 0)
        new_customers = float(r.get("new_customers") or 0)
        repeat_30d    = float(r.get("repeat_30d") or 0)
        impressions   = float(r.get("impressions") or 0)
        clicks        = float(r.get("clicks") or 0)
        ga_sessions   = float(r.get("ga_sessions") or 0)
        ga_atc        = float(r.get("ga_atc") or 0)
        ga_checkout   = float(r.get("ga_checkout") or 0)
        ltv_total     = float(r.get("ltv_30d_total") or 0)

        # BQ pre-computed rate columns (summed directly)
        cpm_col = float(r.get("cpm_col") or 0)
        cpc_col = float(r.get("cpc_col") or 0)
        # CTR derived from summed clicks/impressions (never sum per-row CTR values)
        ctr_col = sd(clicks, impressions) or 0.0
        logger.debug("CTR debug — clicks=%s impressions=%s ctr=%s", clicks, impressions, ctr_col)

        cm1 = delivered_rev - cogs - logistics
        cm2 = cm1 - spend

        # rto_pct for GA true-ROAS calculation
        rto_pct_val = sd(rto_orders, orders) or 0.0
        # True revenue (GA basis): remove RTO share from GA-attributed revenue
        ga_true_rev = ga_rev * (1.0 - rto_pct_val)

        return {
            "spend": spend,
            "shopify_gross": shopify_gross,
            "rto_amount": rto_amount,
            "delivered_rev": delivered_rev,
            "meta_rev": meta_rev,
            "ga_rev": ga_rev,
            "cogs": cogs,
            "logistics": logistics,
            "discount": discount,
            "orders": orders,
            "prepaid_orders": prepaid_ord,
            "rto_orders": rto_orders,
            "new_customers": new_customers,
            "repeat_30d": repeat_30d,
            "impressions": impressions,
            "clicks": clicks,
            "reach": float(r.get("reach") or 0),
            "ga_sessions": ga_sessions,
            "ga_atc": ga_atc,
            "ga_checkout": ga_checkout,
            "ltv_30d_total": ltv_total,
            "frequency_avg": r.get("frequency_avg"),
            "days_live_max": r.get("days_live_max"),
            "cm1": cm1,
            "cm2": cm2,
            # Rate metrics — taken directly from pre-computed BQ columns
            "ctr": ctr_col,
            "cpc": cpc_col,
            "cpm": cpm_col,
            # ROAS variants
            "shopify_roas_pre":  sd(shopify_gross, spend),
            "shopify_roas_post": sd(delivered_rev, spend),
            "meta_roas":         sd(meta_rev,      spend),
            "ga_roas":           sd(ga_rev,        spend),   # ROAS (attr.) = ga_rev / spend
            "ga_true_roas":      sd(ga_true_rev,   spend),   # True ROAS   = ga_rev*(1−rto%) / spend
            # Other derived
            "aov": sd(shopify_gross, orders),
            "cac": sd(spend, new_customers),
            "ltv_30d_per_customer": sd(ltv_total, new_customers),
            "disc_pct":       sd(discount,    shopify_gross),
            "prepaid_pct":    sd(prepaid_ord, orders),
            "rto_pct":        sd(rto_orders,  orders),
            "new_pct":        sd(new_customers, orders),
            "repeat_30d_pct": sd(repeat_30d,  orders),
            "cm1_pct":        sd(cm1,  delivered_rev),
            "cm2_pct":        sd(cm2,  delivered_rev),
            "true_cm_per_order": sd(cm2, orders),
        }

    # legacy shim so other callers still work
    def _agg_row(self, f: MetaAdsFilters) -> dict[str, Any]:
        return self._agg_row_full(f)

    # ------------------------------------------------------------------ KPIs
    def kpis(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("kpis_v4")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        current = self._agg_row_full(f)
        prev    = self._agg_row_full(f.previous_period())

        def delta(key: str) -> float | None:
            c = current.get(key)
            p = prev.get(key)
            if c is None or p is None or p == 0:
                return None
            return (c - p) / abs(p)

        result = {
            "current": current,
            "deltas":  {k: delta(k) for k in current},
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ Waterfall P&L
    def waterfall(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("waterfall_v2")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        agg = self._agg_row_full(f)
        sd  = self._sd

        spend         = agg["spend"]
        shopify_gross = agg["shopify_gross"]
        rto_amount    = agg["rto_amount"]
        delivered_rev = agg["delivered_rev"]
        meta_rev      = agg["meta_rev"]
        ga_rev        = agg["ga_rev"]
        cogs          = agg["cogs"]
        logistics     = agg["logistics"]

        def build(gross: float, rto: float, post_rto_override: float | None = None) -> dict[str, Any]:
            post_rto = post_rto_override if post_rto_override is not None else (gross - rto)
            cm1      = post_rto - cogs - logistics
            cm2      = cm1 - spend
            return {
                "gross":       gross,
                "rto":         rto,
                "post_rto":    post_rto,
                "cogs":        cogs,
                "logistics":   logistics,
                "cm1":         cm1,
                "spends":      spend,
                "cm2":         cm2,
                "true_roas":   sd(post_rto, spend),
                "cm1_pct":     sd(cm1, post_rto) * 100 if sd(cm1, post_rto) is not None else None,
                "cm2_pct":     sd(cm2, post_rto) * 100 if sd(cm2, post_rto) is not None else None,
            }

        result = {
            "shopify": {
                "label": "Shopify (actual delivered)",
                "desc":  "strictest view · what hit the bank account",
                # use SUM(delivered_revenue) directly — more accurate than gross-rto arithmetic
                **build(shopify_gross, rto_amount, post_rto_override=delivered_rev),
            },
            "meta": {
                "label": "Meta (platform-claimed)",
                "desc":  "most generous · includes view-through + assisted",
                **build(meta_rev, rto_amount),
            },
            "ga4": {
                "label": "GA4 (last-click)",
                "desc":  "stricter · UTM-based attribution floor",
                **build(ga_rev, rto_amount),
            },
            "attribution_gap_abs": meta_rev - shopify_gross,
            "attribution_gap_pct": sd(meta_rev - shopify_gross, shopify_gross) if shopify_gross else None,
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ Diagnostic funnel
    def diagnostic_funnel(self, f: MetaAdsFilters) -> dict[str, Any]:
        """4-card acquisition diagnostic with benchmark gaps."""
        cache_key = f.cache_key("diagnostic_v2")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        agg = self._agg_row_full(f)
        sd  = self._sd

        imp       = agg["impressions"]
        clicks    = agg["clicks"]
        sessions  = agg["ga_sessions"]
        atc       = agg["ga_atc"]
        checkout  = agg["ga_checkout"]
        orders    = agg["orders"]

        ctr       = sd(clicks, imp) or 0
        lp_load   = sd(sessions, clicks) or 0
        atc_rate  = sd(atc, sessions) or 0
        cart_ord  = sd(orders, checkout) or 0

        def gap_pct(actual: float, bench: float) -> float:
            return (actual - bench) / bench if bench else 0.0

        result = {
            "ctr":       {"value": ctr,      "benchmark": BENCHMARKS["ctr"],        "gap_pct": gap_pct(ctr,      BENCHMARKS["ctr"]),        "label": "CTR"},
            "lp_load":   {"value": lp_load,  "benchmark": BENCHMARKS["lp_load"],    "gap_pct": gap_pct(lp_load,  BENCHMARKS["lp_load"]),    "label": "LP load rate"},
            "atc_rate":  {"value": atc_rate, "benchmark": BENCHMARKS["atc_rate"],   "gap_pct": gap_pct(atc_rate, BENCHMARKS["atc_rate"]),   "label": "ATC rate"},
            "cart_order":{"value": cart_ord, "benchmark": BENCHMARKS["cart_order"], "gap_pct": gap_pct(cart_ord, BENCHMARKS["cart_order"]), "label": "Cart → order"},
            "steps": [
                {"label": "Impressions", "value": imp,      "rate": 1.0,               "note": "100% baseline"},
                {"label": "Clicks",      "value": clicks,   "rate": ctr,               "note": f"CTR {ctr*100:.2f}% · benchmark 2.3%"},
                {"label": "LP Views",    "value": sessions, "rate": sd(sessions, clicks) or 0, "note": f"LP load {lp_load*100:.0f}% · {(1-lp_load)*100:.0f}% bounce"},
                {"label": "ATC",         "value": atc,      "rate": atc_rate,          "note": f"ATC {atc_rate*100:.1f}% · benchmark 18%"},
                {"label": "Checkout",    "value": checkout, "rate": sd(checkout, atc) or 0,    "note": f"Checkout init {(sd(checkout,atc) or 0)*100:.1f}%"},
                {"label": "Orders",      "value": orders,   "rate": cart_ord,          "note": f"Order rate {cart_ord*100:.1f}% · cart drop {(1-cart_ord)*100:.0f}%"},
            ],
            "overall_cvr": sd(orders, imp),
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # keep old funnel_cvr for any callers still using it
    def funnel_cvr(self, f: MetaAdsFilters) -> dict[str, Any]:
        return self.diagnostic_funnel(f)

    # ------------------------------------------------------------------ trend
    def daily_trend(self, f: MetaAdsFilters, granularity: str = "day") -> list[dict[str, Any]]:
        trunc     = GRANULARITY_TRUNC.get(granularity, "DAY")
        cache_key = f.cache_key(f"trend_{granularity}_v2")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          DATE_TRUNC(created_date, {trunc})                                                   AS date,
          COALESCE(SUM(meta_spends), 0)                                                      AS spend,
          SAFE_DIVIDE(SUM(shopify_revenue),   NULLIF(SUM(meta_spends),   0))                 AS roas_pre,
          SAFE_DIVIDE(SUM(delivered_revenue), NULLIF(SUM(meta_spends),   0))                 AS roas_post,
          SAFE_DIVIDE(SUM(meta_revenue),      NULLIF(SUM(meta_spends),   0))                 AS meta_roas,
          SAFE_DIVIDE(SUM(ga_revenue),        NULLIF(SUM(meta_spends),   0))                 AS ga_roas,
          COALESCE(SUM(shopify_revenue),   0)                                                 AS rev_pre,
          COALESCE(SUM(delivered_revenue), 0)                                                 AS rev_post,
          COALESCE(SUM(meta_revenue),      0)                                                 AS meta_rev,
          COALESCE(SUM(ga_revenue),        0)                                                 AS ga_rev,
          SAFE_DIVIDE(SUM(clicks),            NULLIF(SUM(impressions),   0))                 AS ctr,
          SAFE_DIVIDE(SUM(meta_spends),       NULLIF(SUM(clicks),        0))                 AS cpc,
          SAFE_DIVIDE(SUM(meta_spends),       NULLIF(SUM(impressions),   0)) * 1000          AS cpm,
          SAFE_DIVIDE(SUM(rto_orders),        NULLIF(SUM(shopify_orders),0))                 AS rto_pct,
          SAFE_DIVIDE(SUM(prepaid_orders),    NULLIF(SUM(shopify_orders),0))                 AS prepaid_pct,
          COALESCE(SUM(shopify_orders), 0)                                                    AS orders,
          SAFE_DIVIDE(SUM(meta_spends),       NULLIF(SUM(new_customers), 0))                 AS cac,
          COALESCE(SUM(new_customers), 0)                                                     AS new_customers
        FROM {TABLE}
        WHERE {where}
        GROUP BY 1
        ORDER BY 1 ASC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ performance table (campaign / ad level)
    @staticmethod
    def _fatigue_score(days_live: float, frequency: float,
                       ctr_7d: float | None, ctr_prev: float | None,
                       cpm_7d: float | None, cpm_prev: float | None) -> int:
        ctr_decay = max(0.0, (ctr_prev - ctr_7d) / ctr_prev) if (ctr_prev and ctr_7d is not None) else 0.0
        cpm_rise  = max(0.0, (cpm_7d  - cpm_prev) / cpm_prev) if (cpm_prev and cpm_7d  is not None) else 0.0
        score = (
            min(days_live / 40.0, 1.0) * 30
            + min(frequency / 5.0, 1.0) * 30
            + min(ctr_decay, 1.0) * 20
            + min(cpm_rise,  1.0) * 20
        )
        return min(100, round(score))

    def campaign_table(self, f: MetaAdsFilters, level: str = "campaign",
                       compare_mode: str = "MoM",
                       compare_start: date | None = None,
                       compare_end: date | None = None) -> list[dict[str, Any]]:
        if compare_start and compare_end:
            f = replace(f, compare_start=compare_start, compare_end=compare_end)
        cache_key = f.cache_key(f"table_{level}_v3_{compare_mode}")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if level == "ad":
            group_cols = "ad_name AS name, campaign_name AS campaign"
            group_by   = "ad_name, campaign_name"
        else:
            group_cols = "campaign_name AS name, '' AS campaign"
            group_by   = "campaign_name"

        where_c, params_c = self._where(f)
        sql = f"""
        SELECT
          {group_cols},
          ANY_VALUE(stage)          AS stage,
          ANY_VALUE(brand)          AS brand,
          ANY_VALUE(creative_type)  AS creative_type,
          ANY_VALUE(language)       AS language,
          COALESCE(SUM(meta_spends),         0) AS spend,
          COALESCE(SUM(shopify_revenue),     0) AS shopify_rev_pre,
          COALESCE(SUM(rto_revenue),         0) AS rto_amount,
          COALESCE(SUM(delivered_revenue),   0) AS shopify_rev_post,
          COALESCE(SUM(meta_revenue),        0) AS meta_rev,
          COALESCE(SUM(ga_revenue),          0) AS ga_rev,
          COALESCE(SUM(cogs_amount),         0) AS cogs,
          COALESCE(SUM(logistic_amount),     0) AS logistics,
          COALESCE(SUM(discount_amount),     0) AS discount,
          COALESCE(SUM(shopify_orders),      0) AS orders,
          COALESCE(SUM(prepaid_orders),      0) AS prepaid_orders_sum,
          COALESCE(SUM(rto_orders),          0) AS rto_orders_sum,
          COALESCE(SUM(new_customers),       0) AS new_customers,
          COALESCE(SUM(repeat_30d_customers),0) AS repeat_30d,
          COALESCE(SUM(impressions),         0) AS impressions,
          COALESCE(SUM(clicks),              0) AS clicks,
          COALESCE(SUM(ga_sessions),         0) AS ga_sessions,
          COALESCE(SUM(ga_atc),              0) AS ga_atc,
          COALESCE(SUM(ga_checkout),         0) AS ga_checkout,
          COALESCE(SUM(ltv_30d_value),       0) AS ltv_30d_total,
          MAX(days_live)                         AS days_live,
          ROUND(AVG(frequency), 2)               AS frequency,
          -- 7-day window CTR/CPM for fatigue score
          SAFE_DIVIDE(
            SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN clicks      ELSE 0 END),
            NULLIF(SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
          ) AS ctr_7d,
          SAFE_DIVIDE(
            SUM(CASE WHEN created_date <  DATE_SUB(@end_date, INTERVAL 7 DAY) THEN clicks      ELSE 0 END),
            NULLIF(SUM(CASE WHEN created_date <  DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
          ) AS ctr_prev,
          SAFE_DIVIDE(
            SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN meta_spends ELSE 0 END),
            NULLIF(SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
          ) * 1000 AS cpm_7d,
          SAFE_DIVIDE(
            SUM(CASE WHEN created_date <  DATE_SUB(@end_date, INTERVAL 7 DAY) THEN meta_spends ELSE 0 END),
            NULLIF(SUM(CASE WHEN created_date <  DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
          ) * 1000 AS cpm_prev
        FROM {TABLE}
        WHERE {where_c}
        GROUP BY {group_by}
        ORDER BY spend DESC
        """
        curr_rows = self._run(sql, params_c)

        # Previous period spend for delta
        where_p, params_p = self._where(f.previous_period())
        prev_sql = f"""
        SELECT {group_by.split(',')[0]} AS name,
               COALESCE(SUM(meta_spends), 0) AS spend
        FROM {TABLE}
        WHERE {where_p}
        GROUP BY 1
        """
        prev_rows    = self._run(prev_sql, params_p)
        prev_by_name = {r["name"]: r["spend"] for r in prev_rows}

        sd = self._sd
        for r in curr_rows:
            # Enrich with computed fields
            spend         = float(r.get("spend") or 0)
            shopify_pre   = float(r.get("shopify_rev_pre") or 0)
            shopify_post  = float(r.get("shopify_rev_post") or 0)
            meta_rev      = float(r.get("meta_rev") or 0)
            ga_rev        = float(r.get("ga_rev") or 0)
            cogs          = float(r.get("cogs") or 0)
            logistics     = float(r.get("logistics") or 0)
            discount      = float(r.get("discount") or 0)
            orders        = float(r.get("orders") or 0)
            prepaid_ord   = float(r.get("prepaid_orders_sum") or 0)
            rto_ord       = float(r.get("rto_orders_sum") or 0)
            new_cust      = float(r.get("new_customers") or 0)
            repeat_30d    = float(r.get("repeat_30d") or 0)
            impressions   = float(r.get("impressions") or 0)
            clicks        = float(r.get("clicks") or 0)
            ltv_total     = float(r.get("ltv_30d_total") or 0)
            days_live     = float(r.get("days_live") or 0)
            frequency     = float(r.get("frequency") or 0)

            cm1 = shopify_post - cogs - logistics
            cm2 = cm1 - spend

            r["cm1"]              = cm1
            r["cm2"]              = cm2
            r["cm2_pct"]          = sd(cm2, shopify_post)
            r["shopify_roas_pre"]  = sd(shopify_pre,  spend)
            r["shopify_roas_post"] = sd(shopify_post, spend)
            r["meta_roas"]        = sd(meta_rev, spend)
            r["ga_roas"]          = sd(ga_rev,   spend)
            r["aov"]              = sd(shopify_pre, orders)
            r["ctr"]              = sd(clicks, impressions)
            r["cpc"]              = sd(spend, clicks)
            r["cpm"]              = (spend / impressions * 1000) if impressions else None
            r["cac"]              = sd(spend, new_cust)
            r["ltv_30d_per_customer"] = sd(ltv_total, new_cust)
            r["disc_pct"]         = sd(discount, shopify_pre)
            r["prepaid_pct"]      = sd(prepaid_ord, orders)
            r["rto_pct"]          = sd(rto_ord, orders)
            r["new_pct"]          = sd(new_cust, orders)
            r["repeat_30d_pct"]   = sd(repeat_30d, orders)

            # Fatigue score (0-100)
            r["fatigue_score"] = self._fatigue_score(
                days_live, frequency,
                r.pop("ctr_7d", None),  r.pop("ctr_prev", None),
                r.pop("cpm_7d", None),  r.pop("cpm_prev", None),
            )

            # vs-prior-period spend delta
            p_spend = prev_by_name.get(r.get("name")) or 0
            r["spend_delta"] = sd(spend - p_spend, p_spend)

        self._set_cache(cache_key, curr_rows, ttl=3600)
        return curr_rows

    # ------------------------------------------------------------------ pivot: brand × creative × language
    def pivot_table(self, f: MetaAdsFilters,
                    pivot_by: str = "brand") -> list[dict[str, Any]]:
        """
        pivot_by: "brand" | "creative_type" | "language" | "brand_creative" | "full"
        Returns aggregated P&L per group.
        """
        VALID = {"brand", "creative_type", "language", "brand_creative", "full"}
        if pivot_by not in VALID:
            pivot_by = "brand"

        cache_key = f.cache_key(f"pivot_{pivot_by}_v3")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if pivot_by == "full":
            group_cols = "COALESCE(brand,'?') AS brand, COALESCE(creative_type,'?') AS creative_type, COALESCE(language,'?') AS language"
            group_by   = "brand, creative_type, language"
        elif pivot_by == "brand_creative":
            group_cols = "COALESCE(brand,'?') AS brand, COALESCE(creative_type,'?') AS creative_type, '' AS language"
            group_by   = "brand, creative_type"
        elif pivot_by == "creative_type":
            group_cols = "'' AS brand, COALESCE(creative_type,'?') AS creative_type, '' AS language"
            group_by   = "creative_type"
        elif pivot_by == "language":
            group_cols = "'' AS brand, '' AS creative_type, COALESCE(language,'?') AS language"
            group_by   = "language"
        else:  # brand
            group_cols = "COALESCE(brand,'?') AS brand, '' AS creative_type, '' AS language"
            group_by   = "brand"

        where, params = self._where(f)
        sql = f"""
        SELECT
          {group_cols},
          COALESCE(SUM(meta_spends),         0) AS spend,
          COALESCE(SUM(shopify_revenue),     0) AS shopify_rev_pre,
          COALESCE(SUM(delivered_revenue),   0) AS shopify_rev_post,
          COALESCE(SUM(meta_revenue),        0) AS meta_rev,
          COALESCE(SUM(ga_revenue),          0) AS ga_rev,
          COALESCE(SUM(cogs_amount),         0) AS cogs,
          COALESCE(SUM(logistic_amount),     0) AS logistics,
          COALESCE(SUM(discount_amount),     0) AS discount,
          COALESCE(SUM(shopify_orders),      0) AS orders,
          COALESCE(SUM(rto_revenue),         0) AS rto_amount,
          COALESCE(SUM(prepaid_orders),      0) AS prepaid_orders_sum,
          COALESCE(SUM(rto_orders),          0) AS rto_orders_sum,
          COALESCE(SUM(new_customers),       0) AS new_customers,
          COALESCE(SUM(impressions),         0) AS impressions,
          COALESCE(SUM(clicks),              0) AS clicks,
          COALESCE(SUM(ltv_30d_value),       0) AS ltv_30d_total
        FROM {TABLE}
        WHERE {where}
        GROUP BY {group_by}
        ORDER BY spend DESC
        """
        rows = self._run(sql, params)

        sd = self._sd
        for r in rows:
            spend        = float(r.get("spend") or 0)
            shopify_pre  = float(r.get("shopify_rev_pre") or 0)
            shopify_post = float(r.get("shopify_rev_post") or 0)
            cogs         = float(r.get("cogs") or 0)
            logistics    = float(r.get("logistics") or 0)
            discount     = float(r.get("discount") or 0)
            orders       = float(r.get("orders") or 0)
            prepaid_ord  = float(r.get("prepaid_orders_sum") or 0)
            rto_ord      = float(r.get("rto_orders_sum") or 0)
            new_cust     = float(r.get("new_customers") or 0)
            impressions  = float(r.get("impressions") or 0)
            clicks       = float(r.get("clicks") or 0)
            ltv_total    = float(r.get("ltv_30d_total") or 0)

            cm1 = shopify_post - cogs - logistics
            cm2 = cm1 - spend

            r["cm2"]               = cm2
            r["cm2_pct"]           = sd(cm2, shopify_post)
            r["shopify_roas_pre"]  = sd(shopify_pre,  spend)
            r["shopify_roas_post"] = sd(shopify_post, spend)
            r["meta_roas"]         = sd(float(r.get("meta_rev") or 0), spend)
            r["ga_roas"]           = sd(float(r.get("ga_rev") or 0),   spend)
            r["aov"]               = sd(shopify_pre, orders)
            r["ctr"]               = sd(clicks, impressions)
            r["cac"]               = sd(spend, new_cust)
            r["ltv_30d_per_customer"] = sd(ltv_total, new_cust)
            r["disc_pct"]          = sd(discount, shopify_pre)
            r["prepaid_pct"]       = sd(prepaid_ord, orders)
            r["rto_pct"]           = sd(rto_ord, orders)
            r["new_pct"]           = sd(new_cust, orders)

        self._set_cache(cache_key, rows, ttl=3600)
        return rows

    # ------------------------------------------------------------------ gainers / decliners
    def gainers_decliners(self, f: MetaAdsFilters,
                          level: str = "campaign",
                          sort_by: str = "roas_delta") -> dict[str, Any]:
        """Top 10 gainers and decliners comparing current vs prior period."""
        cache_key = f.cache_key(f"gd_{level}_{sort_by}_v2")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if level == "ad":
            group_col = "ad_name AS name"
            group_by  = "ad_name"
        else:
            group_col = "campaign_name AS name"
            group_by  = "campaign_name"

        def _fetch(wf: MetaAdsFilters) -> dict[str, dict]:
            where, params = self._where(wf)
            sql = f"""
            SELECT
              {group_col},
              COALESCE(SUM(meta_spends),       0) AS spend,
              COALESCE(SUM(delivered_revenue), 0) AS rev_post,
              SAFE_DIVIDE(SUM(delivered_revenue), NULLIF(SUM(meta_spends), 0)) AS roas_post
            FROM {TABLE}
            WHERE {where}
            GROUP BY {group_by}
            """
            return {r["name"]: r for r in self._run(sql, params)}

        curr = _fetch(f)
        prev = _fetch(f.previous_period())

        combined = []
        for name, c in curr.items():
            p = prev.get(name, {})
            c_roas  = c.get("roas_post") or 0
            p_roas  = p.get("roas_post") or 0
            c_rev   = c.get("rev_post") or 0
            p_rev   = p.get("rev_post") or 0
            combined.append({
                "name":        name,
                "prior_roas":  p_roas,
                "current_roas": c_roas,
                "roas_delta":  c_roas - p_roas,
                "roas_delta_pct": (c_roas - p_roas) / abs(p_roas) if p_roas else None,
                "rev_delta":   c_rev - p_rev,
                "current_rev": c_rev,
                "prior_rev":   p_rev,
            })

        combined.sort(key=lambda x: x.get(sort_by) or 0, reverse=True)
        gainers   = [r for r in combined if (r.get(sort_by) or 0) > 0][:10]
        decliners = sorted([r for r in combined if (r.get(sort_by) or 0) < 0],
                           key=lambda x: x.get(sort_by) or 0)[:10]

        result = {"gainers": gainers, "decliners": decliners}
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ stage / creative breakdown (kept for overview compat)
    def stage_breakdown(self, f: MetaAdsFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("stage_breakdown")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(stage, 'Unknown')                                           AS stage,
          COALESCE(SUM(meta_spends), 0)                                       AS spend,
          SAFE_DIVIDE(SUM(delivered_revenue), NULLIF(SUM(meta_spends), 0))    AS roas,
          COALESCE(SUM(shopify_orders), 0)                                    AS orders,
          SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))               AS ctr,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(new_customers), 0))        AS cac
        FROM {TABLE}
        WHERE {where}
        GROUP BY 1
        ORDER BY spend DESC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    def creative_table(self, f: MetaAdsFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("creative_table")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(creative_type, 'Unknown')                                   AS creative_type,
          COALESCE(SUM(meta_spends), 0)                                       AS spend,
          COALESCE(SUM(impressions), 0)                                       AS impressions,
          SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))               AS ctr,
          SAFE_DIVIDE(SUM(delivered_revenue), NULLIF(SUM(meta_spends), 0))    AS roas,
          COALESCE(SUM(delivered_revenue), 0)                                 AS revenue,
          COALESCE(SUM(shopify_orders), 0)                                    AS orders
        FROM {TABLE}
        WHERE {where}
        GROUP BY 1
        ORDER BY spend DESC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ fatigued ads
    def fatigued_ads(self, f: MetaAdsFilters, min_days: int = 7) -> list[dict[str, Any]]:
        cache_key = f.cache_key(f"fatigued_v2_{min_days}")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        WITH agg AS (
          SELECT
            COALESCE(ad_name, 'Unknown')                                          AS ad_name,
            COALESCE(creative_type, '')                                           AS creative_type,
            COALESCE(language, '')                                                AS language,
            campaign_name,
            MAX(days_live)                                                        AS days_live,
            ROUND(AVG(frequency), 2)                                             AS frequency,
            COALESCE(SUM(meta_spends), 0)                                        AS spend,
            SAFE_DIVIDE(SUM(delivered_revenue), NULLIF(SUM(meta_spends), 0))     AS roas,
            SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))                AS ctr,
            SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(impressions), 0)) * 1000    AS cpm,
            SAFE_DIVIDE(
              SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN clicks      ELSE 0 END),
              NULLIF(SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
            ) AS ctr_recent,
            SAFE_DIVIDE(
              SUM(CASE WHEN created_date < DATE_SUB(@end_date, INTERVAL 7 DAY) THEN clicks       ELSE 0 END),
              NULLIF(SUM(CASE WHEN created_date < DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions  ELSE 0 END), 0)
            ) AS ctr_prev,
            SAFE_DIVIDE(
              SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN meta_spends ELSE 0 END),
              NULLIF(SUM(CASE WHEN created_date >= DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions ELSE 0 END), 0)
            ) * 1000 AS cpm_recent,
            SAFE_DIVIDE(
              SUM(CASE WHEN created_date < DATE_SUB(@end_date, INTERVAL 7 DAY) THEN meta_spends  ELSE 0 END),
              NULLIF(SUM(CASE WHEN created_date < DATE_SUB(@end_date, INTERVAL 7 DAY) THEN impressions  ELSE 0 END), 0)
            ) * 1000 AS cpm_prev
          FROM {TABLE}
          WHERE {where}
          GROUP BY 1, 2, 3, 4
        )
        SELECT * FROM agg
        WHERE days_live >= {min_days}
        ORDER BY frequency DESC
        LIMIT 30
        """
        rows = self._run(sql, params)
        for r in rows:
            cr = r.pop("ctr_recent", None)
            cp = r.pop("ctr_prev",   None)
            mr = r.pop("cpm_recent", None)
            mp = r.pop("cpm_prev",   None)
            r["ctr_delta_7d"] = (cr - cp) / abs(cp) if (cr is not None and cp and cp != 0) else None
            r["cpm_delta_7d"] = (mr - mp) / abs(mp) if (mr is not None and mp and mp != 0) else None
            # Compute fatigue score so ActionListSection can use r.fatigue_score directly
            r["fatigue_score"] = self._fatigue_score(
                float(r.get("days_live") or 0),
                float(r.get("frequency") or 0),
                cr, cp,
                mr, mp,
            )

        self._set_cache(cache_key, rows, ttl=3600)
        return rows

    # ------------------------------------------------------------------ filter options
    def filter_options(self) -> dict[str, list[str]]:
        cache_key = "meta:filter_options_v2"
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        sql = f"""
        SELECT
          ARRAY_AGG(DISTINCT campaign_name IGNORE NULLS ORDER BY campaign_name LIMIT 100) AS campaigns,
          ARRAY_AGG(DISTINCT stage         IGNORE NULLS ORDER BY stage         LIMIT 50)  AS stages,
          ARRAY_AGG(DISTINCT creative_type IGNORE NULLS ORDER BY creative_type LIMIT 50)  AS creative_types,
          ARRAY_AGG(DISTINCT brand         IGNORE NULLS ORDER BY brand         LIMIT 50)  AS brands,
          ARRAY_AGG(DISTINCT language      IGNORE NULLS ORDER BY language      LIMIT 50)  AS languages,
          ARRAY_AGG(DISTINCT ad_name       IGNORE NULLS ORDER BY ad_name       LIMIT 200) AS ad_names
        FROM {TABLE}
        WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """
        rows = self._run(sql, [])
        result: dict[str, list[str]] = {
            "campaigns": [], "stages": [], "creative_types": [],
            "brands": [], "languages": [], "ad_names": [],
        }
        if rows:
            r = rows[0]
            for key in result:
                result[key] = [x for x in (r.get(key) or []) if x]
        self._set_cache(cache_key, result, ttl=86400)
        return result
