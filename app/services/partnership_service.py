"""Partnership analytics service.

Source: `innovist-master-data.shopify.v_partnership_table`
Columns: created_date, source, key, total_orders, new_customers,
         prepaid_orders, shopify_revenue, disc_pct, new_pct, prepaid_pct,
         rto_pct, spend, pp_revenue
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

TABLE = "`innovist-master-data.shopify.v_partnership_table`"

GRANULARITY_TRUNC = {
    "day":   "DAY",
    "week":  "WEEK(MONDAY)",
    "month": "MONTH",
}

# Map raw source values → display names shown in UI
SOURCE_LABELS: dict[str, str] = {
    "gpay":    "Google Pay",
    "phonepe": "PhonePe",
    "paytm":   "Paytm",
}


@dataclass
class PartnershipFilters:
    start_date:    date
    end_date:      date
    sources:       list[str] | None = None
    compare_mode:  str = "MoM"
    compare_start: date | None = None
    compare_end:   date | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "PartnershipFilters":
        if self.compare_start and self.compare_end:
            return replace(self, start_date=self.compare_start, end_date=self.compare_end)
        days = self.length_days
        if self.compare_mode == "DoD":
            prev_end   = self.start_date - timedelta(days=1)
            prev_start = prev_end - timedelta(days=days - 1)
        elif self.compare_mode == "WoW":
            prev_start = self.start_date - timedelta(days=7)
            prev_end   = self.end_date   - timedelta(days=7)
        else:
            prev_start = self.start_date - timedelta(days=30)
            prev_end   = self.end_date   - timedelta(days=30)
        return replace(self, start_date=prev_start, end_date=prev_end)

    def cache_key(self, prefix: str) -> str:
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            (self.compare_start.isoformat() if self.compare_start else self.compare_mode),
            (self.compare_end.isoformat() if self.compare_end else ""),
            ",".join(sorted(self.sources or [])),
        ]
        key_hash = hashlib.md5("|".join(parts).encode()).hexdigest()[:12]
        return f"partner:{prefix}:{key_hash}"


class PartnershipService:
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
        except Exception as exc:
            logger.warning("Redis unavailable for partnership service: %s", exc)
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

    def _where(self, f: PartnershipFilters) -> tuple[str, list]:
        clauses = ["created_date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.sources:
            clauses.append("LOWER(source) IN UNNEST(@sources)")
            params.append(bigquery.ArrayQueryParameter("sources", "STRING", [s.lower() for s in f.sources]))
        return " AND ".join(clauses), params

    def _agg_row(self, f: PartnershipFilters) -> dict[str, Any]:
        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(SUM(spend), 0)                                                 AS spend,
          COALESCE(SUM(shopify_revenue), 0)                                       AS revenue,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(spend), 0))                AS roas,
          COALESCE(SUM(total_orders), 0)                                          AS orders,
          COALESCE(SUM(new_customers), 0)                                         AS new_customers,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(new_customers), 0))                  AS cac,
          AVG(disc_pct)                                                            AS disc_pct,
          SAFE_DIVIDE(SUM(new_customers), NULLIF(SUM(total_orders), 0))           AS new_pct,
          AVG(prepaid_pct)                                                         AS prepaid_pct,
          AVG(rto_pct)                                                             AS rto_pct,
          COALESCE(SUM(pp_revenue), 0)                                             AS pp_revenue
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        return rows[0] if rows else {}

    # ------------------------------------------------------------------ KPIs
    def kpis(self, f: PartnershipFilters) -> dict[str, Any]:
        cache_key = f.cache_key("kpis")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        current = self._agg_row(f)
        prev    = self._agg_row(f.previous_period())

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

    # ------------------------------------------------------------------ partners breakdown
    def partners(self, f: PartnershipFilters) -> list[dict[str, Any]]:
        """One row per source with current metrics + period delta (respects f.compare_mode)."""
        cache_key = f.cache_key("partners")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where_c, params_c = self._where(f)
        sql = f"""
        SELECT
          source,
          COALESCE(SUM(spend), 0)                                                 AS spend,
          COALESCE(SUM(shopify_revenue), 0)                                       AS revenue,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(spend), 0))                AS roas,
          COALESCE(SUM(total_orders), 0)                                          AS orders,
          SAFE_DIVIDE(SUM(shopify_revenue), NULLIF(SUM(total_orders), 0))         AS aov,
          COALESCE(SUM(new_customers), 0)                                         AS new_customers,
          SAFE_DIVIDE(SUM(new_customers), NULLIF(SUM(total_orders), 0))           AS new_pct,
          AVG(disc_pct)                                                            AS disc_pct,
          AVG(prepaid_pct)                                                         AS prepaid_pct,
          AVG(rto_pct)                                                             AS rto_pct,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(new_customers), 0))                  AS cac,
          SAFE_DIVIDE(SUM(spend), NULLIF(SUM(total_orders), 0))                   AS commission_per_order,
          SAFE_DIVIDE(SUM(total_orders),
            NULLIF(SUM(total_orders), 0))                                         AS cvr
        FROM {TABLE}
        WHERE {where_c}
        GROUP BY source
        ORDER BY spend DESC
        """
        curr_rows = self._run(sql, params_c)

        # Previous period for delta
        prev_f = f.previous_period()
        where_p, params_p = self._where(prev_f)
        sql_prev = f"""
        SELECT source, COALESCE(SUM(spend), 0) AS spend
        FROM {TABLE}
        WHERE {where_p}
        GROUP BY source
        """
        prev_rows = {r["source"]: r["spend"] for r in self._run(sql_prev, params_p)}

        for r in curr_rows:
            src = r.get("source") or ""
            r["name"] = SOURCE_LABELS.get(src.lower(), src.title())
            r["sub"]  = src.lower()
            c_sp = r.get("spend") or 0
            p_sp = prev_rows.get(src, 0)
            r["spend_delta"] = (c_sp - p_sp) / abs(p_sp) if p_sp else None

        self._set_cache(cache_key, curr_rows, ttl=3600)
        return curr_rows

    # ------------------------------------------------------------------ MoM trend
    def trend(self, f: PartnershipFilters) -> list[dict[str, Any]]:
        """Monthly orders per source for the trend line chart."""
        cache_key = f.cache_key("trend_monthly")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        # Always show last 6 months regardless of date filter for the trend
        end   = f.end_date
        start = end.replace(day=1) - timedelta(days=150)  # ~5 prior months

        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", start),
            bigquery.ScalarQueryParameter("end_date",   "DATE", end),
        ]
        sql = f"""
        SELECT
          FORMAT_DATE('%b', DATE_TRUNC(created_date, MONTH))  AS month,
          DATE_TRUNC(created_date, MONTH)                      AS month_date,
          LOWER(source)                                        AS source,
          COALESCE(SUM(total_orders), 0)                       AS orders
        FROM {TABLE}
        WHERE created_date BETWEEN @start_date AND @end_date
        GROUP BY month, month_date, source
        ORDER BY month_date ASC, source
        """
        rows = self._run(sql, params)

        # Pivot: one dict per month with keys per source
        months: dict[str, dict[str, Any]] = {}
        for r in rows:
            m = r["month"]
            if m not in months:
                months[m] = {"month": m}
            months[m][r["source"]] = r["orders"]

        result = list(months.values())
        self._set_cache(cache_key, result, ttl=3600)
        return result
