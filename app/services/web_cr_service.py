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
    compare_mode: str = "MoM"
    compare_start: date | None = None
    compare_end: date | None = None
    channel_groups: list[str] | None = None
    devices: list[str] | None = None
    countries: list[str] | None = None
    campaigns: list[str] | None = None
    content_groups: list[str] | None = None
    landing_pages: list[str] | None = None
    session_types: list[str] | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "WebCRFilters":
        if self.compare_start and self.compare_end:
            return replace(self, start_date=self.compare_start, end_date=self.compare_end)
        n = self.length_days
        m = self.compare_mode
        if m == "DoD":
            shift = n
        elif m == "WoW":
            shift = 7
        elif m == "YoY":
            shift = 365
        else:
            shift = 30
        return replace(self,
                       start_date=self.start_date - timedelta(days=shift),
                       end_date=self.end_date   - timedelta(days=shift))

    def cache_key(self, prefix: str) -> str:
        """Generate deterministic cache key from filter values."""
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            (self.compare_start.isoformat() if self.compare_start else ""),
            (self.compare_end.isoformat() if self.compare_end else ""),
            ",".join(sorted(self.channel_groups or [])),
            ",".join(sorted(self.devices or [])),
            ",".join(sorted(self.countries or [])),
            ",".join(sorted(self.campaigns or [])),
            ",".join(sorted(self.content_groups or [])),
            ",".join(sorted(self.landing_pages or [])),
            ",".join(sorted(s.lower() for s in (self.session_types or []))),
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
                host=settings.redis_host,
                port=settings.redis_port,
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
            wants_new = "new" in normalized
            wants_ret = "returning" in normalized
            if wants_ret and not wants_new:
                clauses.append("LOWER(IFNULL(session_type, '')) LIKE '%return%'")
            elif wants_new and not wants_ret:
                clauses.append("LOWER(IFNULL(session_type, '')) NOT LIKE '%return%'")
            # both or neither -> no clause
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
        cache_key = f.cache_key("agg_v2")
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
            SUM(hour) AS total_hour,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN sessions ELSE 0 END) AS returning_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE sessions END) AS new_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN purchases ELSE 0 END) AS returning_purchases,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE purchases END) AS new_purchases,
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
        total_hour = a.get("total_hour") or 0
        returning_sessions = a.get("returning_sessions") or 0
        new_sessions = a.get("new_sessions") or 0
        returning_purchases = a.get("returning_purchases") or 0
        new_purchases = a.get("new_purchases") or 0
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
        out["avg_session_duration"] = (total_hour / sessions) if sessions else 0
        out["bounce_rate"] = None
        out["returning_visitor_pct"] = (returning_sessions / sessions) if sessions else 0
        out["new_visitor_pct"] = (new_sessions / sessions) if sessions else 0
        out["returning_cr"] = (returning_purchases / returning_sessions) if returning_sessions else 0
        out["new_cr"] = (new_purchases / new_sessions) if new_sessions else 0
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

    # ===================================================================== KPIs
    def overview(self, f: WebCRFilters) -> dict[str, Any]:
        cache_key = f.cache_key("overview_v2")
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
        cache_key = f.cache_key("funnel_v3")
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
        cache_key = f.cache_key("cr_trend_v2")
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
            SUM(revenue) AS revenue,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN sessions ELSE 0 END) AS returning_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE sessions END) AS new_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN purchases ELSE 0 END) AS returning_purchases,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE purchases END) AS new_purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        rows = self._run(sql, params)
        result = []
        for r in rows:
            ret_s = r.get("returning_sessions") or 0
            new_s = r.get("new_sessions") or 0
            ret_p = r.get("returning_purchases") or 0
            new_p = r.get("new_purchases") or 0
            r["returning_cr"] = (ret_p / ret_s) if ret_s else 0
            r["new_cr"] = (new_p / new_s) if new_s else 0
            result.append(r)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= funnel by channel
    def funnel_by_channel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_by_channel")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(purchases) AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY channel
        ORDER BY sessions DESC
        LIMIT 10
        """
        rows = self._run(sql, params)
        result = []
        for r in rows:
            sess = r.get("sessions") or 0
            atc = r.get("add_to_cart") or 0
            bc = r.get("begin_checkout") or 0
            pur = r.get("purchases") or 0
            result.append({
                "channel": r["channel"],
                "sessions": sess,
                "atc_rate": (atc / sess) if sess else 0,
                "checkout_cr": (bc / atc) if atc else 0,
                "purchase_rate": (pur / sess) if sess else 0,
            })
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= funnel by device
    def funnel_by_device(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_by_device_v2")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(device_category, '(unknown)') AS device,
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(view_cart) AS view_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info) AS add_payment_info,
            SUM(purchases) AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY device
        ORDER BY sessions DESC
        """
        rows = self._run(sql, params)
        result = []
        for r in rows:
            sess = r.get("sessions") or 0
            steps = [
                ("Sessions",       r.get("sessions") or 0),
                ("Add to cart",    r.get("add_to_cart") or 0),
                ("View cart",      r.get("view_cart") or 0),
                ("Begin checkout", r.get("begin_checkout") or 0),
                ("Shipping info",  r.get("add_shipping_info") or 0),
                ("Payment info",  r.get("add_payment_info") or 0),
                ("Purchase",      r.get("purchases") or 0),
            ]
            out_steps = []
            prev = None
            for label, count in steps:
                step_conv = (count / prev) if prev else 1.0
                overall = (count / sess) if sess else 0
                out_steps.append({
                    "step": label,
                    "count": count,
                    "overall_pct": overall,
                    "step_conversion": step_conv,
                    "drop": (1 - step_conv) if prev else 0,
                })
                prev = count
            result.append({
                "device": r["device"],
                "sessions": sess,
                "cr": ((r.get("purchases") or 0) / sess) if sess else 0,
                "steps": out_steps,
            })
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ==================================================== day-of-week × hour heatmap
    def funnel_hourly_heatmap(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_hourly_heatmap")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        # BigQuery EXTRACT(DAYOFWEEK FROM date) returns 1 (Sunday) .. 7 (Saturday)
        sql = f"""
        SELECT
            EXTRACT(DAYOFWEEK FROM date) AS dow,
            CAST(hour AS INT64) AS hour,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where} AND hour IS NOT NULL
        GROUP BY dow, hour
        ORDER BY dow, hour
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= page-level funnel
    def page_funnel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("page_funnel")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS total_sessions,
            SUM(views) AS total_views,
            SUM(add_to_cart) AS total_atc
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        HAVING total_views > 0
        ORDER BY total_views DESC
        LIMIT 15
        """
        rows = self._run(sql, params)
        result = []
        for r in rows:
            views = r.get("total_views") or 0
            atc = r.get("total_atc") or 0
            result.append({
                "landing_page": r["landing_page"],
                "sessions": r.get("total_sessions") or 0,
                "views": views,
                "add_to_cart": atc,
                "atc_rate": (atc / views) if views else 0,
            })
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ===================================================== top landing pages
    def top_landing_pages(self, f: WebCRFilters) -> list[str]:
        """Top 10 landing pages by sessions, ignoring any landing_pages filter
        so the dropdown options remain stable when one is selected."""
        options_filter = replace(f, landing_pages=None)
        cache_key = options_filter.cache_key("top_landing_pages")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 10
        """
        rows = self._run(sql, params)
        result = [r["landing_page"] for r in rows]
        logger.info("top_landing_pages found %d pages: %s", len(result), result[:5])
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= top channels
    def top_channels(self, f: WebCRFilters) -> list[str]:
        """All channel_group values ordered by sessions desc, ignoring any
        channel_groups filter so the option list stays stable when one is picked."""
        options_filter = replace(f, channel_groups=None)
        cache_key = options_filter.cache_key("top_channels")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel_group,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY channel_group
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 30
        """
        rows = self._run(sql, params)
        result = [r["channel_group"] for r in rows]
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= top content groups
    def top_content_groups(self, f: WebCRFilters) -> list[str]:
        options_filter = replace(f, content_groups=None)
        cache_key = options_filter.cache_key("top_content_groups")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(content_group, '(unknown)') AS content_group,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY content_group
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 20
        """
        rows = self._run(sql, params)
        result = [r["content_group"] for r in rows]
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= channel table (table on Channels tab)
    def channel_table(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Per-channel current-period KPIs plus YoY CR delta."""
        cache_key = f.cache_key("channel_table")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql_curr = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where}
        GROUP BY channel
        ORDER BY sessions DESC
        LIMIT 20
        """
        curr_rows = self._run(sql_curr, params)

        yoy_filter = replace(
            f,
            start_date=f.start_date - timedelta(days=365),
            end_date=f.end_date - timedelta(days=365),
        )
        where_yoy, params_yoy = self._where(yoy_filter)
        sql_yoy = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr_yoy
        FROM {self.table}
        WHERE {where_yoy}
        GROUP BY channel
        """
        try:
            yoy_map = {r["channel"]: r.get("cr_yoy") for r in self._run(sql_yoy, params_yoy)}
        except Exception as e:
            logger.warning("channel_table YoY query failed (%s) — proceeding with no YoY", e)
            yoy_map = {}

        result = []
        for r in curr_rows:
            cr = r.get("cr") or 0
            cr_yoy = yoy_map.get(r["channel"])
            yoy_delta = ((cr - cr_yoy) / cr_yoy) if cr_yoy else None
            result.append({**r, "yoy_delta": yoy_delta})

        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= channel trend (chart on Channels tab)
    def channel_trend(self, f: WebCRFilters, top_n: int = 5) -> dict[str, Any]:
        """Daily CVR per top-N channel by sessions. Returns {channels, rows}
        where rows are pivoted: [{date, channelA: cr, channelB: cr, ...}]."""
        cache_key = f.cache_key(f"channel_trend_top{top_n}")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top = self.top_channels(f)[:top_n]
        if not top:
            empty = {"channels": [], "rows": []}
            self._set_cache(cache_key, empty, ttl=3600)
            return empty

        where, params = self._where(f)
        params = params + [bigquery.ArrayQueryParameter("top_channels", "STRING", top)]
        sql = f"""
        SELECT
            date,
            COALESCE(channel_group, '(unknown)') AS channel,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where}
          AND channel_group IN UNNEST(@top_channels)
        GROUP BY date, channel
        ORDER BY date, channel
        """
        rows = self._run(sql, params)

        pivot: dict[str, dict[str, Any]] = {}
        for r in rows:
            d = r["date"]
            bucket = pivot.setdefault(d, {"date": d})
            bucket[r["channel"]] = r.get("cr") or 0

        out_rows = [pivot[d] for d in sorted(pivot.keys())]
        result = {"channels": top, "rows": out_rows}
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= funnel trend (daily)

    def _funnel_row(self, r: dict) -> dict:
        """Convert raw aggregated row → rates dict."""
        s = r.get("sessions") or 0
        atc = r.get("add_to_cart") or 0
        vc  = r.get("view_cart")   or 0
        bc  = r.get("begin_checkout") or 0
        sh  = r.get("add_shipping_info") or 0
        py  = r.get("add_payment_info")  or 0
        pu  = r.get("purchases") or 0
        return {
            "sessions":   s,
            "atc":        atc,
            "view_cart":  vc,
            "checkout":   bc,
            "shipping":   sh,
            "payment":    py,
            "purchase":   pu,
            # step rates — each as % of sessions for consistent comparison
            "atc_rate":      atc / s if s else 0,
            "view_cart_rate": vc / s if s else 0,
            "checkout_rate":  bc / s if s else 0,
            "shipping_rate":  sh / s if s else 0,
            "payment_rate":   py / s if s else 0,
            "purchase_rate":  pu / s if s else 0,
        }

    def funnel_trend(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Daily funnel step rates — sessions + each step as % of sessions."""
        cache_key = f.cache_key("funnel_trend_v1")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            date,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        rows = self._run(sql, params)
        result = [{"date": r["date"], **self._funnel_row(r)} for r in rows]
        self._set_cache(cache_key, result, ttl=3600)
        return result

    def _build_segmented_funnel_trend(
        self,
        rows: list[dict],
        key_field: str,
        segments: list[str],
    ) -> dict[str, Any]:
        """
        Common helper: given raw rows with a segment key field,
        return {names: [...], series: {name: [{date, sessions, atc_rate, ...}]}}
        """
        # group raw rows by segment → date order
        by_seg: dict[str, list[dict]] = {s: [] for s in segments}
        for r in sorted(rows, key=lambda x: x["date"]):
            seg = r.get(key_field)
            if seg in by_seg:
                by_seg[seg].append({"date": r["date"], **self._funnel_row(r)})
        return {"names": segments, "series": by_seg}

    def channel_funnel_trend(self, f: WebCRFilters, top_n: int = 5) -> dict[str, Any]:
        """Daily funnel steps per top-N channel.
        Returns {names: [...], series: {channel: [{date, sessions, atc_rate, ...}]}}
        """
        cache_key = f.cache_key(f"channel_funnel_trend_v2_top{top_n}")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top = self.top_channels(f)[:top_n]
        if not top:
            result = {"names": [], "series": {}}
            self._set_cache(cache_key, result, ttl=3600)
            return result

        where, params = self._where(f)
        params = params + [bigquery.ArrayQueryParameter("top_channels", "STRING", top)]
        sql = f"""
        SELECT
            date,
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
          AND channel_group IN UNNEST(@top_channels)
        GROUP BY date, channel
        ORDER BY date, channel
        """
        rows = self._run(sql, params)
        result = self._build_segmented_funnel_trend(rows, "channel", top)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    def landing_page_funnel_trend(self, f: WebCRFilters, top_n: int = 10) -> dict[str, Any]:
        """Daily funnel steps per top-N landing page.
        Returns {names: [...], series: {page: [{date, sessions, atc_rate, ...}]}}
        """
        cache_key = f.cache_key(f"lp_funnel_trend_v2_top{top_n}")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top_pages = self.top_landing_pages(f)[:top_n]
        if not top_pages:
            result = {"names": [], "series": {}}
            self._set_cache(cache_key, result, ttl=3600)
            return result

        where, params = self._where(f)

        # Separate real page paths from the null-placeholder so IN UNNEST works
        NULL_LABEL = "(unknown)"
        real_pages = [p for p in top_pages if p != NULL_LABEL]
        has_unknown = NULL_LABEL in top_pages

        if real_pages:
            params = params + [bigquery.ArrayQueryParameter("top_pages", "STRING", real_pages)]
            lp_filter = (
                "COALESCE(landing_page, '(unknown)') IN UNNEST(@top_pages)"
                if not has_unknown
                else (
                    "(landing_page IN UNNEST(@top_pages)"
                    " OR landing_page IS NULL)"
                )
            )
        else:
            # Only null-traffic in top list
            lp_filter = "landing_page IS NULL"

        sql = f"""
        SELECT
            date,
            COALESCE(landing_page, '{NULL_LABEL}') AS landing_page,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
          AND ({lp_filter})
        GROUP BY date, landing_page
        ORDER BY date, landing_page
        """
        rows = self._run(sql, params)
        logger.info("landing_page_funnel_trend: %d rows returned for %d pages", len(rows), len(top_pages))
        result = self._build_segmented_funnel_trend(rows, "landing_page", top_pages)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= content group CR
    def content_group_cr(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Sessions & CR grouped by content_group — used for the Pages tab bar chart."""
        cache_key = f.cache_key("content_group_cr")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(NULLIF(content_group, ''), '(not set)') AS content_group,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SUM(revenue) AS revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY content_group
        HAVING sessions > 0
        ORDER BY sessions DESC
        LIMIT 10
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= product pages
    def product_pages(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Product-page-level analytics — landing pages whose URL looks like a PDP.
        Returns PDP views, ATC count, ATC rate, purchase CVR, revenue."""
        cache_key = f.cache_key("product_pages")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS sessions,
            SUM(views) AS pdp_views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(add_to_cart), NULLIF(SUM(views), 0)) AS atc_rate,
            SAFE_DIVIDE(SUM(purchases), NULLIF(SUM(sessions), 0)) AS cr
        FROM {self.table}
        WHERE {where}
          AND (LOWER(landing_page) LIKE '/product%' OR LOWER(landing_page) LIKE '%/products/%')
        GROUP BY landing_page
        HAVING pdp_views > 0
        ORDER BY revenue DESC
        LIMIT 50
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= top campaigns
    def top_campaigns(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Campaign-level funnel rollup — sessions, ATC, begin_checkout,
        purchases, CVR, AOV, revenue. Excludes empty campaign names."""
        cache_key = f.cache_key("top_campaigns")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(NULLIF(campaign, ''), '(not set)') AS campaign,
            SUM(sessions) AS sessions,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), NULLIF(SUM(sessions), 0)) AS cr,
            SAFE_DIVIDE(SUM(revenue), NULLIF(SUM(purchases), 0)) AS aov
        FROM {self.table}
        WHERE {where}
        GROUP BY campaign
        HAVING sessions > 0
        ORDER BY revenue DESC
        LIMIT 50
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= filter options
    def filter_options(self) -> dict[str, list[str]]:
        cols = {
            "channels": "channel_group",
            "devices": "device_category",
            "countries": "country",
            "campaigns": "campaign",
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
                rows = self._run(sql, [])
                out[key] = [str(r["v"]) for r in rows if r.get("v") is not None]
            except Exception as e:
                logger.warning("web-cr filter %s failed: %s", col, e)
                out[key] = []
        return out