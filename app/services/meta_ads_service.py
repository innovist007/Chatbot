"""Meta Ads analytics service.

Source: `innovist-master-data.shopify.v_meta_spends_table`
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

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "MetaAdsFilters":
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))

    def cache_key(self, prefix: str) -> str:
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
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

    def _agg_row(self, f: MetaAdsFilters) -> dict[str, Any]:
        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(SUM(meta_spends), 0)                                       AS spend,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
          COALESCE(SUM(shopify_revenue), 0)                                   AS revenue,
          COALESCE(SUM(shopify_orders), 0)                                    AS orders,
          COALESCE(SUM(impressions), 0)                                       AS impressions,
          COALESCE(SUM(clicks), 0)                                            AS clicks,
          SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))               AS ctr,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(clicks), 0))               AS cpc,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(impressions), 0)) * 1000   AS cpm,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(new_customers), 0))        AS cac,
          COALESCE(SUM(new_customers), 0)                                     AS new_customers,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(shopify_orders), 0))   AS aov
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        return rows[0] if rows else {}

    # ------------------------------------------------------------------ KPIs
    def kpis(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("kpis")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        current = self._agg_row(f)
        prev = self._agg_row(f.previous_period())

        def delta(key: str) -> float | None:
            c = current.get(key)
            p = prev.get(key)
            if c is None or p is None or p == 0:
                return None
            return (c - p) / abs(p)

        result = {
            "current": current,
            "deltas": {k: delta(k) for k in current},
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ trend
    def daily_trend(self, f: MetaAdsFilters, granularity: str = "day") -> list[dict[str, Any]]:
        trunc = GRANULARITY_TRUNC.get(granularity, "DAY")
        cache_key = f.cache_key(f"trend_{granularity}")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          DATE_TRUNC(created_date, {trunc})                                    AS date,
          COALESCE(SUM(meta_spends), 0)                                       AS spend,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
          COALESCE(SUM(shopify_revenue), 0)                                   AS revenue,
          COALESCE(SUM(impressions), 0)                                       AS impressions,
          COALESCE(SUM(clicks), 0)                                            AS clicks,
          SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))               AS ctr,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(clicks), 0))               AS cpc,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(impressions), 0)) * 1000   AS cpm,
          COALESCE(SUM(shopify_orders), 0)                                    AS orders
        FROM {TABLE}
        WHERE {where}
        GROUP BY 1
        ORDER BY 1 ASC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ performance table
    def _table_query_sql(self, level: str) -> str:
        if level == "ad":
            group_col = "ad_name AS name, campaign_name AS campaign"
            group_by = "ad_name, campaign_name"
        else:
            group_col = "campaign_name AS name, campaign_name AS campaign"
            group_by = "campaign_name"

        return f"""
        SELECT
          {group_col},
          ANY_VALUE(stage)                                                      AS stage,
          COALESCE(SUM(meta_spends), 0)                                       AS spend,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
          COALESCE(SUM(shopify_orders), 0)                                    AS orders,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(shopify_orders), 0))   AS aov,
          AVG(disc_pct)                                                        AS disc_pct,
          AVG(new_pct)                                                         AS new_pct,
          AVG(prepaid_pct)                                                     AS prepaid_pct,
          AVG(rto_pct)                                                         AS rto_pct,
          SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(new_customers), 0))        AS cac,
          AVG(repeat_30d_pct)                                                  AS repeat_30d_pct
        FROM {TABLE}
        WHERE {{where}}
        GROUP BY {group_by}
        ORDER BY spend DESC
        """

    def campaign_table(self, f: MetaAdsFilters, level: str = "campaign", compare_mode: str = "MoM") -> list[dict[str, Any]]:
        cache_key = f.cache_key(f"table_{level}_{compare_mode}")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        sql_tmpl = self._table_query_sql(level)

        # Current period
        where_c, params_c = self._where(f)
        curr_rows = self._run(sql_tmpl.format(where=where_c), params_c)

        # Previous period for delta
        where_p, params_p = self._where(f.previous_period())
        prev_rows = self._run(sql_tmpl.format(where=where_p), params_p)
        prev_by_name = {r.get("name"): r for r in prev_rows}

        for r in curr_rows:
            prev = prev_by_name.get(r.get("name"), {})
            c_spend = r.get("spend") or 0
            p_spend = prev.get("spend") or 0
            r["spend_delta"] = (c_spend - p_spend) / abs(p_spend) if p_spend else None

        self._set_cache(cache_key, curr_rows, ttl=3600)
        return curr_rows

    # ------------------------------------------------------------------ funnel CVR
    def funnel_cvr(self, f: MetaAdsFilters) -> dict[str, Any]:
        cache_key = f.cache_key("funnel_cvr_v2")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(SUM(impressions), 0)    AS impressions,
          COALESCE(SUM(clicks), 0)         AS clicks,
          COALESCE(SUM(ga_sessions), 0)    AS lp_views,
          COALESCE(SUM(ga_atc), 0)         AS atc,
          COALESCE(SUM(ga_checkout), 0)    AS checkout,
          COALESCE(SUM(shopify_orders), 0) AS orders
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        r = rows[0] if rows else {}
        imp      = r.get("impressions") or 0
        clicks   = r.get("clicks") or 0
        lp_views = r.get("lp_views") or 0
        atc      = r.get("atc") or 0
        checkout = r.get("checkout") or 0
        orders   = r.get("orders") or 0

        def safe_div(a: float, b: float) -> float:
            return a / b if b else 0.0

        steps = [
            {"label": "Impressions", "value": imp,      "rate": 1.0,                         "note": "100% baseline"},
            {"label": "Clicks",      "value": clicks,   "rate": safe_div(clicks, imp),        "note": f"CTR {safe_div(clicks, imp)*100:.2f}% · benchmark 2.3%"},
            {"label": "LP Views",    "value": lp_views, "rate": safe_div(lp_views, clicks),   "note": f"LP load rate {safe_div(lp_views, clicks)*100:.0f}% · {(1-safe_div(lp_views, clicks))*100:.0f}% bounce"},
            {"label": "ATC",         "value": atc,      "rate": safe_div(atc, lp_views),      "note": f"ATC rate {safe_div(atc, lp_views)*100:.1f}% · benchmark 18%"},
            {"label": "Checkout",    "value": checkout, "rate": safe_div(checkout, atc),      "note": f"Checkout init {safe_div(checkout, atc)*100:.1f}%"},
            {"label": "Orders",      "value": orders,   "rate": safe_div(orders, checkout),   "note": f"Order rate {safe_div(orders, checkout)*100:.1f}% · cart drop {(1-safe_div(orders, checkout))*100:.0f}%"},
        ]

        result = {
            "steps": steps,
            "overall_cvr": safe_div(orders, imp),
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ------------------------------------------------------------------ stage / creative
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
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
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
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
          COALESCE(SUM(shopify_revenue), 0)                                   AS revenue,
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
        # Wrap in a CTE so we can filter on the MAX(days_live) alias without
        # triggering BigQuery's "aggregation of aggregation" error in HAVING.
        sql = f"""
        WITH agg AS (
          SELECT
            COALESCE(ad_name, 'Unknown')                                          AS ad_name,
            COALESCE(creative_type, '')                                           AS creative_type,
            COALESCE(language, '')                                                AS language,
            campaign_name,
            MAX(days_live)                                                        AS days_live,
            ROUND(AVG(frequency), 2)                                             AS frequency,
            COALESCE(SUM(meta_spends), 0)                                       AS spend,
            SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(meta_spends), 0))      AS roas,
            SAFE_DIVIDE(SUM(clicks), NULLIF(SUM(impressions), 0))               AS ctr,
            SAFE_DIVIDE(SUM(meta_spends), NULLIF(SUM(impressions), 0)) * 1000   AS cpm,
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
            cp = r.pop("ctr_prev", None)
            r["ctr_delta_7d"] = (cr - cp) / abs(cp) if (cr is not None and cp and cp != 0) else None
            mr = r.pop("cpm_recent", None)
            mp = r.pop("cpm_prev", None)
            r["cpm_delta_7d"] = (mr - mp) / abs(mp) if (mr is not None and mp and mp != 0) else None

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
