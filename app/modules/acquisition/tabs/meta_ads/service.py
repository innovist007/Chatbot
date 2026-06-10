"""Meta Ads analytics service — all acquisition endpoints.

Source: `innovist-master-data.shopify.v_meta_spends_table`
Geo:    `innovist-master-data.shopify.v_fb_pincode_table`
"""
from __future__ import annotations

import json
import logging
from dataclasses import replace
from datetime import date, datetime, timedelta
from typing import Any

import redis
from google.cloud import bigquery

from app.config import ANALYTICS_TTL, CACHE_V, Settings
from app.modules.acquisition.tabs.meta_ads.filters import (
    GRANULARITY_TRUNC, MetaAdsFilters,
)

logger = logging.getLogger(__name__)

TABLE     = "`innovist-master-data.shopify.v_meta_spends_table`"
GEO_TABLE = "`innovist-master-data.shopify.v_fb_pincode_table`"


class MetaAdsService:

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client   = bigquery.Client(project=settings.gcp_project_id)
        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host, port=settings.redis_port, db=0,
                decode_responses=True, socket_connect_timeout=2,
            )
            self.redis_client.ping()
            self.cache_enabled = True
        except Exception as exc:
            logger.warning("Redis unavailable for meta ads: %s", exc)
            self.redis_client = None
            self.cache_enabled = False

    # ------------------------------------------------------------------ cache

    def _get_cache(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            data = self.redis_client.get(key)
            if data:
                logger.info("🎯 Cache HIT  [meta]: %s", key)
                return json.loads(data)
            logger.info("❌ Cache MISS [meta]: %s", key)
            return None
        except Exception:
            return None

    def _set_cache(self, key: str, value: Any, ttl: int = ANALYTICS_TTL) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info("💾 Cache SET  [meta]: %s (ttl=%ss)", key, ttl)
        except Exception:
            pass

    # ------------------------------------------------------------------ helpers

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        cfg  = bigquery.QueryJobConfig(query_parameters=params)
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
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
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
        if f.adset_names:
            clauses.append("adset_name IN UNNEST(@adset_names)")
            params.append(bigquery.ArrayQueryParameter("adset_names", "STRING", f.adset_names))
        return " AND ".join(clauses), params

    @staticmethod
    def _sd(a: float | None, b: float | None) -> float | None:
        if a is None or b is None or b == 0:
            return None
        return a / b

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

    def _agg_row_full(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("agg_full")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached
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
          COALESCE(SUM(total_units_sold),      0) AS units_sold,
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
          AVG(frequency)                           AS frequency_avg,
          MAX(days_live)                           AS days_live_max
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        r    = rows[0] if rows else {}

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
        units_sold    = float(r.get("units_sold") or 0)
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

        ctr_col = sd(clicks, impressions) or 0.0
        cpc_col = sd(spend, clicks) or 0.0
        cpm_col = (spend / impressions * 1000) if impressions else 0.0

        cm1 = delivered_rev - cogs - logistics
        cm2 = cm1 - spend

        rto_pct_val = sd(rto_orders, orders) or 0.0
        ga_true_rev = ga_rev * (1.0 - rto_pct_val)

        return {
            "spend": spend, "shopify_gross": shopify_gross, "rto_amount": rto_amount,
            "delivered_rev": delivered_rev, "meta_rev": meta_rev, "ga_rev": ga_rev,
            "cogs": cogs, "logistics": logistics, "discount": discount,
            "orders": orders, "prepaid_orders": prepaid_ord, "rto_orders": rto_orders,
            "new_customers": new_customers, "repeat_30d": repeat_30d,
            "impressions": impressions, "clicks": clicks, "reach": float(r.get("reach") or 0),
            "ga_sessions": ga_sessions, "ga_atc": ga_atc, "ga_checkout": ga_checkout,
            "ltv_30d_total": ltv_total, "frequency_avg": r.get("frequency_avg"),
            "days_live_max": r.get("days_live_max"),
            "cm1": cm1, "cm2": cm2, "ctr": ctr_col, "cpc": cpc_col, "cpm": cpm_col,
            "shopify_roas_pre":  sd(shopify_gross, spend),
            "shopify_roas_post": sd(delivered_rev, spend),
            "meta_roas":         sd(meta_rev,      spend),
            "ga_roas":           sd(ga_rev,        spend),
            "ga_true_roas":      sd(ga_true_rev,   spend),
            "units_sold": units_sold, "avg_selling_price": sd(shopify_gross, units_sold),
            "aov": sd(shopify_gross, orders), "mrp_revenue": shopify_gross + discount,
            "cac": sd(spend, new_customers), "ltv_30d_per_customer": sd(ltv_total, new_customers),
            "disc_pct":       sd(discount,    shopify_gross),
            "prepaid_pct":    sd(prepaid_ord, orders),
            "rto_pct":        sd(rto_orders,  orders),
            "new_pct":        sd(new_customers, orders),
            "repeat_30d_pct": sd(repeat_30d,  orders),
            "cm1_pct":        sd(cm1,  delivered_rev),
            "cm2_pct":        sd(cm2,  delivered_rev),
            "true_cm_per_order": sd(cm2, orders),
        }
        self._set_cache(cache_key, result)  # unreachable — preserved from original
        return result

    def _agg_row(self, f: MetaAdsFilters) -> dict[str, Any]:
        return self._agg_row_full(f)

    # ------------------------------------------------------------------ KPIs

    def kpis(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("kpis")
        cached    = self._get_cache(cache_key)
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

        result = {"current": current, "deltas": {k: delta(k) for k in current}}
        self._set_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ Waterfall P&L

    def waterfall(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("waterfall")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        agg           = self._agg_row_full(f)
        sd            = self._sd
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
                "gross":     gross, "rto": rto, "post_rto": post_rto,
                "cogs":      cogs, "logistics": logistics, "cm1": cm1,
                "spends":    spend, "cm2": cm2,
                "true_roas": sd(post_rto, spend),
                "cm1_pct":   sd(cm1, post_rto) * 100 if sd(cm1, post_rto) is not None else None,
                "cm2_pct":   sd(cm2, post_rto) * 100 if sd(cm2, post_rto) is not None else None,
            }

        result = {
            "shopify": {"label": "Shopify (actual delivered)", "desc": "strictest view · what hit the bank account",
                        **build(shopify_gross, rto_amount, post_rto_override=delivered_rev)},
            "meta":    {"label": "Meta (platform-claimed)",    "desc": "most generous · includes view-through + assisted",
                        **build(meta_rev, rto_amount)},
            "ga4":     {"label": "GA4 (last-click)",           "desc": "stricter · UTM-based attribution floor",
                        **build(ga_rev, rto_amount)},
            "attribution_gap_abs": meta_rev - shopify_gross,
            "attribution_gap_pct": sd(meta_rev - shopify_gross, shopify_gross) if shopify_gross else None,
        }
        self._set_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ Trend

    def daily_trend(self, f: MetaAdsFilters, granularity: str = "day") -> list[dict[str, Any]]:
        trunc     = GRANULARITY_TRUNC.get(granularity, "DAY")
        cache_key = f.cache_key(f"trend_{granularity}")
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
          COALESCE(SUM(new_customers),        0)                                              AS new_customers,
          COALESCE(SUM(repeat_30d_customers), 0)                                              AS repeat_30d,
          COALESCE(SUM(cogs_amount),          0)                                              AS cogs,
          COALESCE(SUM(logistic_amount),      0)                                              AS logistics
        FROM {TABLE}
        WHERE {where}
        GROUP BY 1
        ORDER BY 1 ASC
        """
        result = self._run(sql, params)
        for row in result:
            delivered = float(row.get("rev_post") or 0)
            cogs      = float(row.get("cogs")     or 0)
            logistics = float(row.get("logistics") or 0)
            spend     = float(row.get("spend")     or 0)
            cm2       = delivered - cogs - logistics - spend
            row["cm2"]        = round(cm2, 2)
            row["cm2_pct"]    = round(cm2 / delivered * 100, 2) if delivered else None
            nc  = float(row.get("new_customers") or 0)
            r30 = float(row.get("repeat_30d") or 0)
            row["repeat_rate"] = round(r30 / nc * 100, 2) if nc else None
        self._set_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ Performance table

    def campaign_table(self, f: MetaAdsFilters, level: str = "campaign",
                       compare_mode: str = "MoM",
                       compare_start: date | None = None,
                       compare_end: date | None = None) -> list[dict[str, Any]]:
        if compare_start and compare_end:
            f = replace(f, compare_start=compare_start, compare_end=compare_end)
        cache_key = f.cache_key(f"table_{level}_{compare_mode}")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if level == "ad":
            group_cols = "ad_name AS name, campaign_name AS campaign"
            group_by   = "ad_name, campaign_name"
        elif level == "adset":
            group_cols = "adset_name AS name, campaign_name AS campaign"
            group_by   = "adset_name, campaign_name"
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
          COALESCE(SUM(ga_orders),           0) AS ga_orders,
          COALESCE(SUM(ga_rto_orders),       0) AS ga_rto_orders,
          COALESCE(SUM(ltv_30d_value),       0) AS ltv_30d_total,
          MAX(days_live)                         AS days_live,
          ROUND(AVG(frequency), 2)               AS frequency,
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
            spend        = float(r.get("spend") or 0)
            shopify_pre  = float(r.get("shopify_rev_pre") or 0)
            shopify_post = float(r.get("shopify_rev_post") or 0)
            meta_rev     = float(r.get("meta_rev") or 0)
            ga_rev       = float(r.get("ga_rev") or 0)
            cogs         = float(r.get("cogs") or 0)
            logistics    = float(r.get("logistics") or 0)
            discount     = float(r.get("discount") or 0)
            orders       = float(r.get("orders") or 0)
            prepaid_ord  = float(r.get("prepaid_orders_sum") or 0)
            rto_ord      = float(r.get("rto_orders_sum") or 0)
            new_cust     = float(r.get("new_customers") or 0)
            repeat_30d   = float(r.get("repeat_30d") or 0)
            impressions  = float(r.get("impressions") or 0)
            clicks       = float(r.get("clicks") or 0)
            ga_orders    = float(r.get("ga_orders") or 0)
            ga_rto_ords  = float(r.get("ga_rto_orders") or 0)
            ltv_total    = float(r.get("ltv_30d_total") or 0)
            days_live    = float(r.get("days_live") or 0)
            frequency    = float(r.get("frequency") or 0)

            cm1_s = shopify_post - cogs - logistics
            cm2_s = cm1_s - spend
            cm1_g = ga_rev - cogs - logistics
            cm2_g = cm1_g - spend

            r["cm1"] = cm1_s; r["cm2"] = cm2_s
            r["cm2_pct_shopify"] = sd(cm2_s, shopify_post)
            r["cm2_pct_ga"]      = sd(cm2_g, ga_rev)
            r["cm2_pct"]         = r["cm2_pct_shopify"]
            r["shopify_roas_pre"]  = sd(shopify_pre,  spend)
            r["shopify_roas_post"] = sd(shopify_post, spend)
            r["meta_roas"]  = sd(meta_rev, spend)
            r["ga_roas"]    = sd(ga_rev,   spend)
            r["aov_shopify"] = sd(shopify_pre,  orders)
            r["aov_ga"]      = sd(ga_rev,        ga_orders)
            r["aov"]         = r["aov_shopify"]
            r["ctr"]  = sd(clicks, impressions)
            r["cpc"]  = sd(spend, clicks)
            r["cpm"]  = (spend / impressions * 1000) if impressions else None
            r["cac"]  = sd(spend, new_cust)
            r["ltv_30d_per_customer"] = sd(ltv_total, new_cust)
            r["disc_pct_shopify"]    = sd(discount, shopify_pre)
            r["disc_pct_ga"]         = sd(discount, ga_rev)
            r["disc_pct"]            = r["disc_pct_shopify"]
            r["prepaid_pct_shopify"] = sd(prepaid_ord, orders)
            r["prepaid_pct_ga"]      = sd(prepaid_ord, ga_orders)
            r["prepaid_pct"]         = r["prepaid_pct_shopify"]
            r["rto_pct_shopify"]     = sd(rto_ord,      orders)
            r["rto_pct_ga"]          = sd(ga_rto_ords,  ga_orders)
            r["rto_pct"]             = r["rto_pct_shopify"]
            r["new_pct_shopify"]     = sd(new_cust, orders)
            r["new_pct_ga"]          = sd(new_cust, ga_orders)
            r["new_pct"]             = r["new_pct_shopify"]
            r["repeat_30d_pct"]      = sd(repeat_30d, orders)
            r["fatigue_score"] = self._fatigue_score(
                days_live, frequency,
                r.pop("ctr_7d", None), r.pop("ctr_prev", None),
                r.pop("cpm_7d", None), r.pop("cpm_prev", None),
            )
            p_spend = prev_by_name.get(r.get("name")) or 0
            r["spend_delta"] = sd(spend - p_spend, p_spend)

        self._set_cache(cache_key, curr_rows)
        return curr_rows

    # ------------------------------------------------------------------ Pivot table

    def pivot_table(self, f: MetaAdsFilters, pivot_by: str = "brand") -> list[dict[str, Any]]:
        VALID = {"brand", "creative_type", "language", "brand_creative", "full"}
        if pivot_by not in VALID:
            pivot_by = "brand"

        cache_key = f.cache_key(f"pivot_{pivot_by}")
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
        else:
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
          COALESCE(SUM(ga_orders),           0) AS ga_orders,
          COALESCE(SUM(ga_rto_orders),       0) AS ga_rto_orders,
          COALESCE(SUM(ltv_30d_value),       0) AS ltv_30d_total
        FROM {TABLE}
        WHERE {where}
        GROUP BY {group_by}
        ORDER BY spend DESC
        """
        rows = self._run(sql, params)
        sd   = self._sd
        for r in rows:
            spend        = float(r.get("spend") or 0)
            shopify_pre  = float(r.get("shopify_rev_pre") or 0)
            shopify_post = float(r.get("shopify_rev_post") or 0)
            ga_rev       = float(r.get("ga_rev") or 0)
            cogs         = float(r.get("cogs") or 0)
            logistics    = float(r.get("logistics") or 0)
            discount     = float(r.get("discount") or 0)
            orders       = float(r.get("orders") or 0)
            prepaid_ord  = float(r.get("prepaid_orders_sum") or 0)
            rto_ord      = float(r.get("rto_orders_sum") or 0)
            new_cust     = float(r.get("new_customers") or 0)
            impressions  = float(r.get("impressions") or 0)
            clicks       = float(r.get("clicks") or 0)
            ga_orders    = float(r.get("ga_orders") or 0)
            ga_rto_ords  = float(r.get("ga_rto_orders") or 0)
            ltv_total    = float(r.get("ltv_30d_total") or 0)

            cm1_s = shopify_post - cogs - logistics
            cm2_s = cm1_s - spend
            cm1_g = ga_rev      - cogs - logistics
            cm2_g = cm1_g - spend

            r["cm2"]               = cm2_s
            r["cm2_pct_shopify"]   = sd(cm2_s, shopify_post)
            r["cm2_pct_ga"]        = sd(cm2_g, ga_rev)
            r["cm2_pct"]           = r["cm2_pct_shopify"]
            r["shopify_roas_pre"]  = sd(shopify_pre,  spend)
            r["shopify_roas_post"] = sd(shopify_post, spend)
            r["meta_roas"]         = sd(float(r.get("meta_rev") or 0), spend)
            r["ga_roas"]           = sd(ga_rev, spend)
            r["aov_shopify"]       = sd(shopify_pre,  orders)
            r["aov_ga"]            = sd(ga_rev,        ga_orders)
            r["aov"]               = r["aov_shopify"]
            r["ctr"]               = sd(clicks, impressions)
            r["cac"]               = sd(spend, new_cust)
            r["ltv_30d_per_customer"] = sd(ltv_total, new_cust)
            r["disc_pct_shopify"]    = sd(discount, shopify_pre)
            r["disc_pct_ga"]         = sd(discount, ga_rev)
            r["disc_pct"]            = r["disc_pct_shopify"]
            r["prepaid_pct_shopify"] = sd(prepaid_ord, orders)
            r["prepaid_pct_ga"]      = sd(prepaid_ord, ga_orders)
            r["prepaid_pct"]         = r["prepaid_pct_shopify"]
            r["rto_pct_shopify"]     = sd(rto_ord,      orders)
            r["rto_pct_ga"]          = sd(ga_rto_ords,  ga_orders)
            r["rto_pct"]             = r["rto_pct_shopify"]
            r["new_pct_shopify"]     = sd(new_cust, orders)
            r["new_pct_ga"]          = sd(new_cust, ga_orders)
            r["new_pct"]             = r["new_pct_shopify"]

        self._set_cache(cache_key, rows)
        return rows

    # ------------------------------------------------------------------ Gainers / Decliners

    def gainers_decliners(self, f: MetaAdsFilters,
                          level: str = "campaign",
                          sort_by: str = "roas_delta") -> dict[str, Any]:
        cache_key = f.cache_key(f"gd_{level}_{sort_by}")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if level == "ad":
            group_col = "ad_name AS name"
            group_by  = "ad_name"
        elif level == "adset":
            group_col = "adset_name AS name"
            group_by  = "adset_name"
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
            c_roas = c.get("roas_post") or 0
            p_roas = p.get("roas_post") or 0
            c_rev  = c.get("rev_post") or 0
            p_rev  = p.get("rev_post") or 0
            combined.append({
                "name": name, "prior_roas": p_roas, "current_roas": c_roas,
                "roas_delta": c_roas - p_roas,
                "roas_delta_pct": (c_roas - p_roas) / abs(p_roas) if p_roas else None,
                "rev_delta": c_rev - p_rev, "current_rev": c_rev, "prior_rev": p_rev,
            })

        combined.sort(key=lambda x: x.get(sort_by) or 0, reverse=True)
        gainers   = [r for r in combined if (r.get(sort_by) or 0) > 0][:10]
        decliners = sorted([r for r in combined if (r.get(sort_by) or 0) < 0],
                           key=lambda x: x.get(sort_by) or 0)[:10]

        result = {"gainers": gainers, "decliners": decliners}
        self._set_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ Stage / Creative breakdowns

    def stage_breakdown(self, f: MetaAdsFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("stage_breakdown")
        cached    = self._get_cache(cache_key)
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
        self._set_cache(cache_key, result)
        return result

    def creative_table(self, f: MetaAdsFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("creative_table")
        cached    = self._get_cache(cache_key)
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
        self._set_cache(cache_key, result)
        return result

    # ------------------------------------------------------------------ Fatigued ads

    def fatigued_ads(self, f: MetaAdsFilters, min_days: int = 7) -> list[dict[str, Any]]:
        cache_key = f.cache_key(f"fatigued_{min_days}")
        cached    = self._get_cache(cache_key)
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
            r["fatigue_score"] = self._fatigue_score(
                float(r.get("days_live") or 0), float(r.get("frequency") or 0),
                cr, cp, mr, mp,
            )

        self._set_cache(cache_key, rows)
        return rows

    # ------------------------------------------------------------------ Filter options

    def filter_options(self) -> dict[str, list[str]]:
        cache_key = f"meta:{CACHE_V}:filter_options"
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        sql = f"""
        SELECT
          ARRAY_AGG(DISTINCT campaign_name IGNORE NULLS ORDER BY campaign_name LIMIT 100) AS campaigns,
          ARRAY_AGG(DISTINCT stage         IGNORE NULLS ORDER BY stage         LIMIT 50)  AS stages,
          ARRAY_AGG(DISTINCT creative_type IGNORE NULLS ORDER BY creative_type LIMIT 50)  AS creative_types,
          ARRAY_AGG(DISTINCT brand         IGNORE NULLS ORDER BY brand         LIMIT 50)  AS brands,
          ARRAY_AGG(DISTINCT language      IGNORE NULLS ORDER BY language      LIMIT 50)  AS languages,
          ARRAY_AGG(DISTINCT ad_name       IGNORE NULLS ORDER BY ad_name       LIMIT 200) AS ad_names,
          ARRAY_AGG(DISTINCT adset_name    IGNORE NULLS ORDER BY adset_name    LIMIT 200) AS adset_names
        FROM {TABLE}
        WHERE created_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)
        """
        rows   = self._run(sql, [])
        result: dict[str, list[str]] = {
            "campaigns": [], "stages": [], "creative_types": [],
            "brands": [], "languages": [], "ad_names": [], "adset_names": [],
        }
        if rows:
            r = rows[0]
            for key in result:
                result[key] = [x for x in (r.get(key) or []) if x]
        self._set_cache(cache_key, result, ttl=86400)
        return result

    # ------------------------------------------------------------------ Geo performance

    def geo_performance(self, f: MetaAdsFilters, group_by: str = "pincode") -> dict[str, Any]:
        cache_key = f.cache_key(f"geo_{group_by}")
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        if group_by == "pincode":
            loc_expr  = "CONCAT(COALESCE(pincode,'?'), ' · ', COALESCE(location,''))"
            tier_expr = "COALESCE(tier, '')"
            loc_group = "pincode, location, tier"
        elif group_by == "city":
            loc_expr  = "COALESCE(location, 'Unknown')"
            tier_expr = "COALESCE(tier, '')"
            loc_group = "location, tier"
        elif group_by == "state":
            loc_expr  = "COALESCE(state, 'Unknown')"
            tier_expr = "''"
            loc_group = "state"
        else:  # tier
            loc_expr  = "COALESCE(tier, 'Unknown')"
            tier_expr = "COALESCE(tier, '')"
            loc_group = "tier"

        clauses = ["created_date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]
        if f.campaigns:
            clauses.append("campaign_name IN UNNEST(@geo_campaigns)")
            params.append(bigquery.ArrayQueryParameter("geo_campaigns", "STRING", f.campaigns))
        where = " AND ".join(clauses)

        sql = f"""
        WITH base AS (
          SELECT
            {loc_expr}  AS location_key,
            {tier_expr} AS tier,
            SUM(orders)           AS orders,
            SUM(rto_orders)       AS rto_orders,
            SUM(delivered_orders) AS net_orders,
            SUM(prepaid_orders)   AS prepaid_orders,
            SUM(gross_revenue)    AS gross_rev,
            SUM(delivered_revenue) AS net_rev
          FROM {GEO_TABLE}
          WHERE {where}
          GROUP BY 1, 2
        ),
        camp_by_loc AS (
          SELECT
            {loc_expr} AS location_key,
            COALESCE(campaign_name, 'Unknown') AS campaign_name,
            SUM(orders) AS camp_orders,
            ROW_NUMBER() OVER (
              PARTITION BY {loc_expr}
              ORDER BY SUM(orders) DESC
            ) AS rn
          FROM {GEO_TABLE}
          WHERE {where}
          GROUP BY {loc_group}, campaign_name
        ),
        top_srcs AS (
          SELECT
            location_key,
            MAX(CASE WHEN rn = 1 THEN campaign_name END) AS src1_name,
            MAX(CASE WHEN rn = 1 THEN camp_orders   END) AS src1_orders,
            MAX(CASE WHEN rn = 2 THEN campaign_name END) AS src2_name,
            MAX(CASE WHEN rn = 2 THEN camp_orders   END) AS src2_orders,
            SUM(camp_orders) AS total_loc_orders
          FROM camp_by_loc
          WHERE rn <= 2
          GROUP BY 1
        )
        SELECT
          b.location_key                                                          AS location,
          b.tier, b.orders, b.rto_orders, b.net_orders, b.prepaid_orders,
          b.gross_rev, b.net_rev,
          SAFE_DIVIDE(b.rto_orders,     NULLIF(b.orders,          0))            AS rto_pct,
          SAFE_DIVIDE(b.prepaid_orders, NULLIF(b.orders,          0))            AS prepaid_pct,
          1 - SAFE_DIVIDE(b.prepaid_orders, NULLIF(b.orders,      0))            AS cod_pct,
          SAFE_DIVIDE(b.gross_rev,      NULLIF(b.orders,          0))            AS aov,
          ts.src1_name,
          SAFE_DIVIDE(ts.src1_orders, NULLIF(b.orders, 0))                       AS src1_share,
          ts.src2_name,
          SAFE_DIVIDE(ts.src2_orders, NULLIF(b.orders, 0))                       AS src2_share
        FROM base b
        LEFT JOIN top_srcs ts ON b.location_key = ts.location_key
        ORDER BY b.orders DESC
        LIMIT 300
        """
        rows = self._run(sql, params)
        for r in rows:
            sources = []
            s1 = r.pop("src1_name", None); s1s = r.pop("src1_share", None)
            s2 = r.pop("src2_name", None); s2s = r.pop("src2_share", None)
            if s1:
                sources.append({"name": s1, "share": round(s1s or 0, 4)})
            if s2:
                sources.append({"name": s2, "share": round(s2s or 0, 4)})
            r["top_sources"] = sources

        total_orders  = sum(r["orders"] for r in rows)
        total_rto     = sum(r["rto_orders"] for r in rows)
        total_prepaid = sum(r["prepaid_orders"] for r in rows)
        rto_rate      = total_rto / total_orders if total_orders else 0
        cod_share     = 1 - (total_prepaid / total_orders) if total_orders else 0
        eligible      = [r for r in rows if r["orders"] >= 50]
        worst         = max(eligible, key=lambda r: r["rto_pct"] or 0) if eligible else None

        result = {
            "rows": rows,
            "kpis": {
                "total_orders":   total_orders, "total_rto": total_rto,
                "rto_rate":       round(rto_rate, 4), "cod_share": round(cod_share, 4),
                "prepaid_share":  round(1 - cod_share, 4), "location_count": len(rows),
                "worst_location": worst["location"] if worst else None,
                "worst_rto_pct":  worst["rto_pct"]  if worst else None,
                "worst_orders":   worst["orders"]    if worst else None,
            },
        }
        self._set_cache(cache_key, result)
        return result
