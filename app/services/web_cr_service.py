"""Direct BigQuery queries for the Web CR dashboard.

Source: `innovist-master-data.analytics_432719895.data_table_session`

All metrics here mirror the DAX measures from the existing Power BI dashboard
so that numbers reconcile.
"""

from __future__ import annotations

import logging
import hashlib
import json
import redis
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class WebCRFilters:
    start_date: date
    end_date: date
    channel_groups: list[str] | None = None
    devices: list[str] | None = None
    countries: list[str] | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "WebCRFilters":
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))
    
    def cache_key(self, prefix: str) -> str:
        """Generate deterministic cache key from filter values."""
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            ",".join(sorted(self.channel_groups or [])),
            ",".join(sorted(self.devices or [])),
            ",".join(sorted(self.countries or [])),
        ]
        key_string = "|".join(parts)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()[:12]
        return f"webcr:{prefix}:{key_hash}"


class WebCRService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        self.table = "`innovist-master-data.analytics_432719895.data_table_session`"
        
        # Initialize Redis
        try:
            self.redis_client = redis.Redis(
                host='localhost',
                port=6379,
                db=0,
                decode_responses=True,
                socket_connect_timeout=2
            )
            self.redis_client.ping()
            self.cache_enabled = True
            logger.info("✅ Redis cache connected successfully")
            print("✅ Redis cache connected successfully")
        except Exception as e:
            logger.warning(f"⚠️  Redis unavailable, caching disabled: {e}")
            print(f"⚠️  Redis unavailable, caching disabled: {e}")
            self.redis_client = None
            self.cache_enabled = False
    
    def _get_cache(self, key: str) -> Any | None:
        """Get value from cache with console logging."""
        if not self.cache_enabled:
            return None
        try:
            data = self.redis_client.get(key)
            if data:
                logger.info(f"🎯 Cache HIT: {key}")
                print(f"🎯 Cache HIT: {key}")
                return json.loads(data)
            logger.info(f"❌ Cache MISS: {key}")
            print(f"❌ Cache MISS: {key}")
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            print(f"❌ Cache error: {e}")
            return None
    
    def _set_cache(self, key: str, value: Any, ttl: int = 3600) -> None:
        """Set value in cache with TTL and console logging."""
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info(f"💾 Cache SET: {key} (TTL: {ttl}s)")
            print(f"💾 Cache SET: {key} (TTL: {ttl}s)")
        except Exception as e:
            logger.error(f"Cache set error: {e}")
            print(f"❌ Cache set error: {e}")
    
    def get_latest_date(self) -> date | None:
        """Get the most recent date with data."""
        cache_key = "web_cr:latest_date"
        cached = self._get_cache(cache_key)
        if cached:
            return date.fromisoformat(cached) if isinstance(cached, str) else cached
        
        sql = f"""
        SELECT MAX(date) AS latest_date
        FROM {self.table}
        """
        
        rows = self._run(sql, [])
        if not rows or not rows[0].get("latest_date"):
            return None
        
        latest = rows[0]["latest_date"]
        if isinstance(latest, str):
            latest = date.fromisoformat(latest)
        elif isinstance(latest, datetime):
            latest = latest.date()

# ✅ cache safely
        self._set_cache(cache_key, latest.isoformat(), ttl=3600)
        # Cache for 1 hour (data refreshes during day, but date doesn't change often)
        # self._set_cache(cache_key, latest.isoformat() if hasattr(latest, 'isoformat') else str(latest), ttl=3600)
        return latest

    # ------------------------------------------------------------------ helpers
    def _where(self, f: WebCRFilters) -> tuple[str, list]:
        clauses = ["date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
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
        return " AND ".join(clauses), params

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        logger.info("🔍 Executing BigQuery query...")
        print("🔍 Executing BigQuery query...")
        cfg = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(sql, job_config=cfg).result()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()
            out.append(d)
        logger.info(f"✅ BigQuery returned {len(out)} rows")
        print(f"✅ BigQuery returned {len(out)} rows")
        return out

    # -------------------------------------------------------- core aggregates
    def _aggregates(self, f: WebCRFilters) -> dict[str, float]:
        cache_key = f.cache_key("agg")
        cached = self._get_cache(cache_key)
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
            COUNT(DISTINCT date) AS days
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        result = {k: (v or 0) for k, v in (rows[0] if rows else {}).items()}
        
        self._set_cache(cache_key, result, ttl=3600)
        return result

    @staticmethod
    def _derive(a: dict[str, float]) -> dict[str, float]:
        sessions = a.get("sessions") or 0
        purchases = a.get("purchases") or 0
        revenue = a.get("revenue") or 0
        atc = a.get("add_to_cart") or 0
        vc = a.get("view_cart") or 0
        bc = a.get("begin_checkout") or 0
        sh = a.get("add_shipping_info") or 0
        py = a.get("add_payment_info") or 0
        days = a.get("days") or 1

        out = dict(a)
        out["cr"] = (purchases / sessions) if sessions else 0
        out["aov"] = (revenue / purchases) if purchases else 0
        out["revenue_per_session"] = (revenue / sessions) if sessions else 0
        out["atc_rate"] = (atc / sessions) if sessions else 0
        out["view_cart_rate"] = (vc / atc) if atc else 0
        out["begin_checkout_rate"] = (bc / vc) if vc else 0
        out["shipping_info_rate"] = (sh / bc) if bc else 0
        out["payment_info_rate"] = (py / sh) if sh else 0
        out["purchase_rate"] = (purchases / py) if py else 0
        out["checkout_cr"] = (purchases / bc) if bc else 0
        out["daily_avg_sessions"] = sessions / days
        out["daily_avg_purchases"] = purchases / days
        out["daily_avg_revenue"] = revenue / days
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = [
            "sessions", "purchases", "revenue", "cr", "aov",
            "revenue_per_session", "atc_rate", "checkout_cr",
            "daily_avg_sessions", "daily_avg_purchases", "daily_avg_revenue",
        ]
        out = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            out[k] = ((c - p) / p) if p else None
        return out

    # ===================================================================== KPIs
    def overview(self, f: WebCRFilters) -> dict[str, Any]:
        cache_key = f.cache_key("overview")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        curr = self._derive(self._aggregates(f))
        prev = self._derive(self._aggregates(f.previous_period()))
        result = {
            "current": curr,
            "previous": prev,
            "deltas": self._delta(curr, prev),
            "compare_label": f"vs prev. {f.length_days}d",
        }
        
        self._set_cache(cache_key, result, ttl=1800)
        return result

    # ================================================================== Funnel
    def funnel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        a = self._aggregates(f)
        sessions = a.get("sessions") or 0
        steps = [
            ("Sessions",        a.get("sessions"),         None),
            ("Add to cart",     a.get("add_to_cart"),      "sessions"),
            ("View cart",       a.get("view_cart"),        "add_to_cart"),
            ("Begin checkout",  a.get("begin_checkout"),   "view_cart"),
            ("Shipping info",   a.get("add_shipping_info"),"begin_checkout"),
            ("Payment info",    a.get("add_payment_info"), "add_shipping_info"),
            ("Purchase",        a.get("purchases"),        "add_payment_info"),
        ]

        out: list[dict[str, Any]] = []
        prev_count: float | None = None
        for label, cnt, _ in steps:
            cnt_f = cnt or 0
            step_conv = (cnt_f / prev_count) if prev_count else 1.0
            drop_pct = (1 - step_conv) if prev_count else 0
            overall = (cnt_f / sessions) if sessions else 0
            out.append({
                "step": label,
                "count": cnt_f,
                "step_conversion": step_conv,
                "drop": drop_pct,
                "overall_pct": overall,
            })
            prev_count = cnt_f
        
        self._set_cache(cache_key, out, ttl=3600)
        return out

    # ============================================================== by source
    def by_source(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_source")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS source,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY source
        ORDER BY sessions DESC
        LIMIT 20
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ============================================================== by device
    def by_device(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_device")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(device_category, '(unknown)') AS device,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY device
        ORDER BY sessions DESC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ============================================================ by country
    def by_country(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_country")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(country, '(unknown)') AS country,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY country
        ORDER BY sessions DESC
        LIMIT 10
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ======================================================= top landing pages
    def landing_pages(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("landing")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        ORDER BY sessions DESC
        LIMIT 15
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ============================================================== by hour
    def by_hour(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_hour")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            CAST(hour AS INT64) AS hour,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where} AND hour IS NOT NULL
        GROUP BY hour
        ORDER BY hour
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ============================================================ daily trend
    def cr_trend(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("cr_trend")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            date,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SUM(revenue) AS revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= filter options
    def filter_options(self) -> dict[str, list[str]]:
        cols = {"channels": "channel_group", "devices": "device_category", "countries": "country"}
        out: dict[str, list[str]] = {}
        for key, col in cols.items():
            try:
                sql = f"""
                SELECT DISTINCT {col} AS v
                FROM {self.table}
                WHERE {col} IS NOT NULL AND CAST({col} AS STRING) != ''
                ORDER BY v LIMIT 200
                """
                rows = self._run(sql, [])
                out[key] = [str(r["v"]) for r in rows if r.get("v") is not None]
            except Exception as e:
                logger.warning("web-cr filter %s failed: %s", col, e)
                out[key] = []
        return out