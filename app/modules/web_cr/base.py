from __future__ import annotations

import json
import logging
from dataclasses import replace
from datetime import date, datetime
from typing import Any

import redis
from google.cloud import bigquery

from app.config import ANALYTICS_TTL, Settings
from app.modules.web_cr.filters import WebCRFilters

logger = logging.getLogger(__name__)

TABLE = "`innovist-master-data.analytics_432719895.data_table_session`"


class WebCRBase:
    """Shared BigQuery + Redis infrastructure for all Web CR tab services."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client   = bigquery.Client(project=settings.gcp_project_id)
        self.table    = TABLE
        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host, port=settings.redis_port, db=0,
                decode_responses=True, socket_connect_timeout=2,
            )
            self.redis_client.ping()
            self.cache_enabled = True
        except Exception as exc:
            logger.warning("Redis unavailable for web_cr: %s", exc)
            self.redis_client = None
            self.cache_enabled = False

    # ------------------------------------------------------------------ cache

    def _get_cache(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            data = self.redis_client.get(key)
            if data:
                logger.info("🎯 Cache HIT  [webcr]: %s", key)
                return json.loads(data)
            logger.info("❌ Cache MISS [webcr]: %s", key)
            return None
        except Exception:
            return None

    def _set_cache(self, key: str, value: Any, ttl: int = ANALYTICS_TTL) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info("💾 Cache SET  [webcr]: %s (ttl=%ss)", key, ttl)
        except Exception:
            pass

    # ------------------------------------------------------------------ query runner

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

    # ------------------------------------------------------------------ WHERE builder

    def _where(self, f: WebCRFilters) -> tuple[str, list]:
        clauses = ["date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]
        if f.channel_groups:
            clauses.append("channel_group IN UNNEST(@channels)")
            params.append(bigquery.ArrayQueryParameter("channels", "STRING", f.channel_groups))
        if f.devices:
            clauses.append("device_category IN UNNEST(@devices)")
            params.append(bigquery.ArrayQueryParameter("devices", "STRING", f.devices))
        if f.countries:
            clauses.append("country IN UNNEST(@countries)")
            params.append(bigquery.ArrayQueryParameter("countries", "STRING", f.countries))
        if f.campaigns:
            clauses.append("campaign IN UNNEST(@campaigns)")
            params.append(bigquery.ArrayQueryParameter("campaigns", "STRING", f.campaigns))
        if f.content_groups:
            clauses.append("content_group IN UNNEST(@content_groups)")
            params.append(bigquery.ArrayQueryParameter("content_groups", "STRING", f.content_groups))
        if f.landing_pages:
            clauses.append("landing_page IN UNNEST(@landing_pages)")
            params.append(bigquery.ArrayQueryParameter("landing_pages", "STRING", f.landing_pages))
        if f.session_types:
            normalized = {s.lower() for s in f.session_types}
            wants_new  = "new" in normalized
            wants_ret  = "returning" in normalized
            if wants_ret and not wants_new:
                clauses.append("LOWER(IFNULL(session_type, '')) LIKE '%return%'")
            elif wants_new and not wants_ret:
                clauses.append("LOWER(IFNULL(session_type, '')) NOT LIKE '%return%'")
        return " AND ".join(clauses), params

    # ------------------------------------------------------------------ shared aggregation helpers

    def _aggregates(self, f: WebCRFilters) -> dict[str, float]:
        cache_key = f.cache_key("agg_v2")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(view_cart) AS view_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info) AS add_payment_info,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SUM(hour) AS total_hour,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN sessions ELSE 0 END) AS returning_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE sessions END) AS new_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN purchases ELSE 0 END) AS returning_purchases,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE purchases END) AS new_purchases,
            COUNT(DISTINCT date) AS days
        FROM {self.table}
        WHERE {where}
        """
        rows   = self._run(sql, params)
        result = {k: (v or 0) for k, v in (rows[0] if rows else {}).items()}
        self._set_cache(cache_key, result)
        return result

    @staticmethod
    def _derive(a: dict[str, float]) -> dict[str, float]:
        sessions            = a.get("sessions") or 0
        purchases           = a.get("purchases") or 0
        revenue             = a.get("revenue") or 0
        atc                 = a.get("add_to_cart") or 0
        vc                  = a.get("view_cart") or 0
        bc                  = a.get("begin_checkout") or 0
        sh                  = a.get("add_shipping_info") or 0
        py                  = a.get("add_payment_info") or 0
        total_hour          = a.get("total_hour") or 0
        returning_sessions  = a.get("returning_sessions") or 0
        new_sessions        = a.get("new_sessions") or 0
        returning_purchases = a.get("returning_purchases") or 0
        new_purchases       = a.get("new_purchases") or 0
        days                = a.get("days") or 1

        out = dict(a)
        out["cr"]                   = (purchases / sessions) if sessions else 0
        out["aov"]                  = (revenue / purchases) if purchases else 0
        out["revenue_per_session"]  = (revenue / sessions) if sessions else 0
        out["atc_rate"]             = (atc / sessions) if sessions else 0
        out["view_cart_rate"]       = (vc / atc) if atc else 0
        out["begin_checkout_rate"]  = (bc / vc) if vc else 0
        out["shipping_info_rate"]   = (sh / bc) if bc else 0
        out["payment_info_rate"]    = (py / sh) if sh else 0
        out["purchase_rate"]        = (purchases / py) if py else 0
        out["checkout_cr"]          = (purchases / bc) if bc else 0
        out["daily_avg_sessions"]   = sessions / days
        out["daily_avg_purchases"]  = purchases / days
        out["daily_avg_revenue"]    = revenue / days
        out["avg_session_duration"] = (total_hour / sessions) if sessions else 0
        out["bounce_rate"]          = None
        out["returning_visitor_pct"]= (returning_sessions / sessions) if sessions else 0
        out["new_visitor_pct"]      = (new_sessions / sessions) if sessions else 0
        out["returning_cr"]         = (returning_purchases / returning_sessions) if returning_sessions else 0
        out["new_cr"]               = (new_purchases / new_sessions) if new_sessions else 0
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = [
            "sessions", "purchases", "revenue", "cr", "aov",
            "revenue_per_session", "atc_rate", "checkout_cr",
            "daily_avg_sessions", "daily_avg_purchases", "daily_avg_revenue",
            "avg_session_duration", "returning_visitor_pct",
        ]
        out = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            out[k] = ((c - p) / p) if p else None
        return out

    def _funnel_row(self, r: dict) -> dict:
        s   = r.get("sessions") or 0
        atc = r.get("add_to_cart") or 0
        vc  = r.get("view_cart")   or 0
        bc  = r.get("begin_checkout") or 0
        sh  = r.get("add_shipping_info") or 0
        py  = r.get("add_payment_info")  or 0
        pu  = r.get("purchases") or 0
        return {
            "sessions":        s,
            "atc":             atc,
            "view_cart":       vc,
            "checkout":        bc,
            "shipping":        sh,
            "payment":         py,
            "purchase":        pu,
            "atc_rate":        atc / s if s else 0,
            "view_cart_rate":  vc  / s if s else 0,
            "checkout_rate":   bc  / s if s else 0,
            "shipping_rate":   sh  / s if s else 0,
            "payment_rate":    py  / s if s else 0,
            "purchase_rate":   pu  / s if s else 0,
        }

    def _build_segmented_funnel_trend(
        self,
        rows: list[dict],
        key_field: str,
        segments: list[str],
    ) -> dict[str, Any]:
        by_seg: dict[str, list[dict]] = {s: [] for s in segments}
        for r in sorted(rows, key=lambda x: x["date"]):
            seg = r.get(key_field)
            if seg in by_seg:
                by_seg[seg].append({"date": r["date"], **self._funnel_row(r)})
        return {"names": segments, "series": by_seg}

    # ------------------------------------------------------------------ utility endpoints

    def get_latest_date(self) -> date | None:
        cache_key = "web_cr:latest_date"
        cached    = self._get_cache(cache_key)
        if cached:
            return date.fromisoformat(cached) if isinstance(cached, str) else cached

        sql = f"""
        SELECT date AS latest_date
        FROM {self.table} GROUP BY date
        ORDER BY date DESC
        LIMIT 1 OFFSET 1
        """
        rows = self._run(sql, [])
        if not rows or not rows[0].get("latest_date"):
            return None

        latest = rows[0]["latest_date"]
        if isinstance(latest, str):
            latest = date.fromisoformat(latest)
        elif isinstance(latest, datetime):
            latest = latest.date()

        self._set_cache(cache_key, latest.isoformat())
        return latest

    def filter_options(self) -> dict[str, list[str]]:
        cols = {
            "channels":      "channel_group",
            "devices":       "device_category",
            "countries":     "country",
            "campaigns":     "campaign",
            "content_groups": "content_group",
        }
        out: dict[str, list[str]] = {}
        for key, col in cols.items():
            try:
                sql = f"""
                SELECT DISTINCT {col} AS v
                FROM {self.table}
                WHERE {col} IS NOT NULL AND CAST({col} AS STRING) != ''
                ORDER BY v LIMIT 200
                """
                rows     = self._run(sql, [])
                out[key] = [str(r["v"]) for r in rows if r.get("v") is not None]
            except Exception as exc:
                logger.warning("web-cr filter %s failed: %s", col, exc)
                out[key] = []
        return out
