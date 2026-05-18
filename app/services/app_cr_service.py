"""App CR service with Redis caching.

Data source: GA4 app analytics data from BigQuery.
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
class AppCRFilters:
    start_date: date
    end_date: date
    platforms: list[str] | None = None  # Android, iOS, All
    users: list[str] | None = None  # First-time, Returning, All
    compare_mode: str = "MoM"  # DoD, WoW, MoM, YoY

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "AppCRFilters":
        """Get comparison period based on compare_mode."""
        if self.compare_mode == "DoD":
            n = 1
        elif self.compare_mode == "WoW":
            n = 7
        elif self.compare_mode == "YoY":
            n = 365
        else:  # MoM
            n = 30
        
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))
    
    def cache_key(self, prefix: str) -> str:
        """Generate deterministic cache key from filter values."""
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            ",".join(sorted(self.platforms or [])),
            ",".join(sorted(self.users or [])),
            self.compare_mode,
        ]
        key_string = "|".join(parts)
        key_hash = hashlib.md5(key_string.encode()).hexdigest()[:12]
        return f"app_cr:{prefix}:{key_hash}"


class AppCRService:
    """Service for App CR dashboard (GA4 app analytics)."""
    
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        # GA4 app analytics table
        self.table = "`innovist-app-ga4-data-487906.analytics_446636559.data_table_session`"
        
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
            logger.info("✅ Redis cache connected (App CR service)")
            print("✅ Redis cache connected (App CR service)")
        except Exception as e:
            logger.warning(f"⚠️  Redis unavailable: {e}")
            print(f"⚠️  Redis unavailable: {e}")
            self.redis_client = None
            self.cache_enabled = False
    
    def _get_cache(self, key: str) -> Any | None:
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
            logger.error(f"Cache error: {e}")
            return None
    
    def _set_cache(self, key: str, value: Any, ttl: int = 3600) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info(f"💾 Cache SET: {key} (TTL: {ttl}s)")
            print(f"💾 Cache SET: {key} (TTL: {ttl}s)")
        except Exception as e:
            logger.error(f"Cache error: {e}")
    
    def get_latest_date(self) -> date | None:
        """Get the most recent date with data."""
        cache_key = "app_cr:latest_date"
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
    def _where(self, f: AppCRFilters) -> tuple[str, list]:
        clauses = ["DATE BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.platforms and "All" not in f.platforms:
            clauses.append("device_OS IN UNNEST(@platforms)")
            params.append(bigquery.ArrayQueryParameter("platforms", "STRING", f.platforms))
        if f.users and "All" not in f.users:
            # Map UI labels to session_type values (capitalized in the data)
            user_types = []
            if "First-time" in f.users:
                user_types.append("New")  # Changed from "new" to "New"
            if "Returning" in f.users:
                user_types.append("Returning")  # Changed from "returning" to "Returning"
            if user_types:
                clauses.append("session_type IN UNNEST(@user_types)")
                params.append(bigquery.ArrayQueryParameter("user_types", "STRING", user_types))
        return " AND ".join(clauses), params

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        logger.info("🔍 Executing BigQuery query (App CR)...")
        print("🔍 Executing BigQuery query (App CR)...")
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
    def _aggregates(self, f: AppCRFilters) -> dict[str, float]:
        cache_key = f.cache_key("agg")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        
        # Log the date range being queried
        print(f"🔍 Querying App CR data: {f.start_date} to {f.end_date}")
        
        sql = f"""
        SELECT
            SUM(sessions) AS app_opens,
            SUM(install_count) AS installs,
            SUM(uninstall_count) AS uninstalls,
            SUM(CAST(purchases AS INT64)) AS purchases,
            SUM(CAST(revenue AS FLOAT64)) AS revenue,
            AVG(CAST(aov AS FLOAT64)) AS avg_aov,
            SUM(daily_active_users) AS dau,
            SUM(view_item) AS pdp_views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS payment_selected,
            COUNT(DISTINCT DATE) AS days
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        
        if not rows or not rows[0]:
            print("⚠️  No data returned from BigQuery")
            result = {}
        else:
            result = {k: (v or 0) for k, v in rows[0].items()}
            print(f"✅ Data returned: {result.get('app_opens', 0)} sessions, {result.get('purchases', 0)} purchases")
        
        self._set_cache(cache_key, result, ttl=3600)
        return result

    @staticmethod
    def _derive(a: dict[str, float]) -> dict[str, float]:
        """Derive calculated metrics from raw aggregates."""
        app_opens = a.get("app_opens") or 0
        purchases = a.get("purchases") or 0
        revenue = a.get("revenue") or 0
        installs = a.get("installs") or 0
        uninstalls = a.get("uninstalls") or 0
        pdp_views = a.get("pdp_views") or 0
        add_to_cart = a.get("add_to_cart") or 0
        begin_checkout = a.get("begin_checkout") or 0
        payment_selected = a.get("payment_selected") or 0
        days = a.get("days") or 1

        out = dict(a)
        
        # App CR
        out["app_cr"] = (purchases / app_opens) if app_opens else 0
        
        # Revenue per open
        out["revenue_per_open"] = (revenue / app_opens) if app_opens else 0
        
        # Uninstall rate
        out["uninstall_rate"] = (uninstalls / installs) if installs else 0
        
        # Hardcoded values (as requested)
        out["dau_mau"] = 0.184  # 18.4%
        out["avg_sessions_per_user"] = 4.2
        
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = [
            "app_opens", "app_cr", "avg_aov", "revenue_per_open",
            "installs", "uninstalls", "dau_mau", "avg_sessions_per_user",
        ]
        out = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            out[k] = ((c - p) / p) if p else None
        return out

    # ============================================== APP CR OVERVIEW
    def overview(self, f: AppCRFilters) -> dict[str, Any]:
        """Get App CR overview metrics."""
        cache_key = f.cache_key("overview")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        curr = self._derive(self._aggregates(f))
        prev = self._derive(self._aggregates(f.previous_period()))
        
        # Set compare label based on mode
        compare_labels = {
            "DoD": "vs yesterday",
            "WoW": "vs last week",
            "MoM": "vs last month",
            "YoY": "vs last year",
        }
        
        result = {
            "current": curr,
            "previous": prev,
            "deltas": self._delta(curr, prev),
            "compare_label": compare_labels.get(f.compare_mode, "vs prev. period"),
        }
        
        self._set_cache(cache_key, result, ttl=1800)
        return result

    # ============================================================ funnel
    def funnel(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """App conversion funnel with drop-off."""
        cache_key = f.cache_key("funnel")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            SUM(sessions) AS app_opens,
            SUM(view_item) AS pdp_views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS payment_selected,
            SUM(CAST(purchases AS INT64)) AS purchases
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        if not rows:
            return []
        
        r = rows[0]
        app_opens = int(r.get("app_opens") or 0)
        pdp_views = int(r.get("pdp_views") or 0)
        add_to_cart = int(r.get("add_to_cart") or 0)
        begin_checkout = int(r.get("begin_checkout") or 0)
        payment_selected = int(r.get("payment_selected") or 0)
        purchases = int(r.get("purchases") or 0)
        
        # Calculate conversions
        funnel = [
            {
                "step": "App opens",
                "count": app_opens,
                "overall_pct": 1.0,
                "drop": 0,
            },
            {
                "step": "PDP views",
                "count": pdp_views,
                "step_conversion": pdp_views / app_opens if app_opens else 0,
                "overall_pct": pdp_views / app_opens if app_opens else 0,
                "drop": (app_opens - pdp_views) / app_opens if app_opens else 0,
            },
            {
                "step": "Add to cart",
                "count": add_to_cart,
                "step_conversion": add_to_cart / pdp_views if pdp_views else 0,
                "overall_pct": add_to_cart / app_opens if app_opens else 0,
                "drop": (pdp_views - add_to_cart) / pdp_views if pdp_views else 0,
            },
            {
                "step": "Begin checkout",
                "count": begin_checkout,
                "step_conversion": begin_checkout / add_to_cart if add_to_cart else 0,
                "overall_pct": begin_checkout / app_opens if app_opens else 0,
                "drop": (add_to_cart - begin_checkout) / add_to_cart if add_to_cart else 0,
            },
            {
                "step": "Payment selected",
                "count": payment_selected,
                "step_conversion": payment_selected / begin_checkout if begin_checkout else 0,
                "overall_pct": payment_selected / app_opens if app_opens else 0,
                "drop": (begin_checkout - payment_selected) / begin_checkout if begin_checkout else 0,
            },
            {
                "step": "Purchase",
                "count": purchases,
                "step_conversion": purchases / payment_selected if payment_selected else 0,
                "overall_pct": purchases / app_opens if app_opens else 0,
                "drop": (payment_selected - purchases) / payment_selected if payment_selected else 0,
            },
        ]
        
        self._set_cache(cache_key, funnel, ttl=3600)
        return funnel

    # ========================================================= by platform
    def by_platform(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """CR by platform (Android vs iOS)."""
        cache_key = f.cache_key("by_platform")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        
        print(f"🔍 Querying by platform: {f.start_date} to {f.end_date}")
        
        sql = f"""
        SELECT
            device_OS AS platform,
            SUM(sessions) AS opens,
            SAFE_DIVIDE(SUM(CAST(purchases AS INT64)), SUM(sessions)) AS cr,
            AVG(CAST(aov AS FLOAT64)) AS aov
        FROM {self.table}
        WHERE {where}
        GROUP BY device_OS
        HAVING SUM(sessions) > 0
        ORDER BY opens DESC
        """
        rows = self._run(sql, params)
        
        print(f"✅ By platform returned {len(rows)} platforms")
        
        # Add crash rate (hardcoded based on design)
        result = []
        for row in rows:
            r = dict(row)
            platform = r.get('platform', '')
            
            # Set crash rate based on platform
            # if 'iOS' in platform or 'ios' in platform.lower():
            #     r['crash_rate'] = 0.002  # 0.2%
            # elif 'Android' in platform or 'android' in platform.lower():
            #     r['crash_rate'] = 0.006  # 0.6%
            # else:
            #     r['crash_rate'] = 0.004  # 0.4%
            
            result.append(r)
        
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ===================================================== install attribution
    # def install_attribution(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """Install attribution by source (30d)."""
        cache_key = f.cache_key("install_attr")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        
        print(f"🔍 Querying install attribution: {f.start_date} to {f.end_date}")
        
        sql = f"""
        SELECT
            CASE 
                WHEN source = '(direct)' THEN 'Organic'
                WHEN source LIKE '%google%' THEN 'Google UAC'
                WHEN source LIKE '%facebook%' OR source LIKE '%meta%' THEN 'Meta App Install'
                WHEN source LIKE '%refer%' OR medium = 'referral' THEN 'Referral'
                ELSE 'Other'
            END AS source_label,
            SUM(install_count) AS installs
        FROM {self.table}
        WHERE {where} AND install_count > 0
        GROUP BY source_label
        HAVING SUM(install_count) > 0
        ORDER BY installs DESC
        LIMIT 10
        """
        rows = self._run(sql, params)
        
        print(f"✅ Install attribution returned {len(rows)} sources")
        
        # Add hardcoded retention/cost based on source
        result = []
        for row in rows:
            r = dict(row)
            source = r.pop('source_label')
            
            # Set retention and cost based on source type
            # if source == 'Organic':
            #     r['d1_retain'] = 0.52
            #     r['d30_retain'] = 0.28
            #     r['cost_per_install'] = 0
            # elif source == 'Referral':
            #     r['d1_retain'] = 0.61
            #     r['d30_retain'] = 0.34
            #     r['cost_per_install'] = 38
            # elif source == 'Google UAC':
            #     r['d1_retain'] = 0.38
            #     r['d30_retain'] = 0.18
            #     r['cost_per_install'] = 128
            # elif source == 'Meta App Install':
            #     r['d1_retain'] = 0.34
            #     r['d30_retain'] = 0.14
            #     r['cost_per_install'] = 164
            # else:
            #     r['d1_retain'] = 0.34
            #     r['d30_retain'] = 0.14
            #     r['cost_per_install'] = 100
            
            r['source'] = source
            result.append(r)
        
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # def install_attribution(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """Install attribution by raw source (no grouping, no limit)."""
        
        cache_key = f.cache_key("install_attr_raw")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)

        print(f"🔍 Querying install attribution (raw): {f.start_date} to {f.end_date}")

        sql = f"""
        SELECT
            LOWER(TRIM(source)) AS source,
            SUM(install_count) AS installs
        FROM {self.table}
        WHERE {where}
        AND install_count > 0
        AND source IS NOT NULL
        GROUP BY source
        HAVING SUM(install_count) > 0
        ORDER BY installs DESC
        """

        rows = self._run(sql, params)

        print(f"✅ Install attribution returned {len(rows)} sources")

        # No transformation needed now
        result = [dict(row) for row in rows]

        self._set_cache(cache_key, result, ttl=3600)
        return result
    

    def install_attribution(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """Install attribution grouped by source category."""
        
        cache_key = f.cache_key("install_attr")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)

        print(f"🔍 Querying install attribution: {f.start_date} to {f.end_date}")

        sql = f"""
        SELECT
            LOWER(TRIM(source)) AS source,
            SUM(install_count) AS installs
        FROM {self.table}
        WHERE {where}
        AND install_count > 0
        AND source IS NOT NULL
        GROUP BY source
        HAVING SUM(install_count) > 0
        ORDER BY installs DESC
        """

        rows = self._run(sql, params)

        print(f"✅ Install attribution returned {len(rows)} raw sources")

        # Source grouping rules (case-insensitive substring matching)
        source_groups = {
            "Google Play": ["google-play"],
            "Direct": ["(direct)", "direct"],
            "Instagram": ["apps.instagram.com", "instagram", "cap_ig_bio", "ig", "bio"],
            "Google": ["google_ads", "google"],  # google_ads first to avoid overlap
            "Facebook": ["apps.facebook.com", "facebookads", "fb"],
            "Whatsapp": ["whatsapp"],
            "Firebase": ["firebase"],
            "CRM": ["kwikengage", "engage_360", "kwikchat", "sms"],
            "Partnership": ["gpay", "phonepe", "ppay", "patym", "zomato", "paytm"],
            "Push Notification": ["appush", "push"],
            "Others": ["wishlink", "nector", "share", "pixel_launcher", "chatgpt.com", "sp_auto_dm", "judgeme", "ss ig bio - hfs", "packaging"],
        }

        # Group sources
        grouped = {}
        ungrouped_sources = []
        
        for row in rows:
            source = (row.get("source") or "").lower().strip()
            installs = int(row.get("installs") or 0)
            
            # Find matching group
            matched_group = None
            for group_name, patterns in source_groups.items():
                if any(pattern.lower() in source for pattern in patterns):
                    matched_group = group_name
                    break
            
            # If no match, put in Others
            if not matched_group:
                matched_group = "Others"
                ungrouped_sources.append(source)
            
            # Add to group
            if matched_group not in grouped:
                grouped[matched_group] = {
                    "source": matched_group,
                    "installs": 0,
                    "raw_sources": [],
                }
            grouped[matched_group]["installs"] += installs
            grouped[matched_group]["raw_sources"].append(source)
        
        # Log ungrouped sources for debugging
        if ungrouped_sources:
            print(f"📋 Auto-grouped to 'Others': {ungrouped_sources}")
        
        # Convert to list and sort by installs (descending)
        result = sorted(grouped.values(), key=lambda x: x["installs"], reverse=True)
        
        print(f"✅ Grouped into {len(result)} categories: {[r['source'] for r in result]}")

        self._set_cache(cache_key, result, ttl=3600)
        return result
    
    
    
    # ============================================== push notification performance
    def push_performance(self, f: AppCRFilters) -> list[dict[str, Any]]:
        """Push notification performance from campaign data."""
        cache_key = f.cache_key("push_perf")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        
        # Get current period data
        sql_current = f"""
        SELECT
            COALESCE(campaign, 'Direct') AS campaign_type,
            SUM(sessions) AS sent,
            SAFE_DIVIDE(SUM(CAST(purchases AS INT64)), SUM(sessions)) AS cr_after_open,
            SUM(CAST(revenue AS FLOAT64)) AS revenue,
            SAFE_DIVIDE(SUM(CAST(revenue AS FLOAT64)), COUNT(DISTINCT sessions)) AS rev_per_notif
        FROM {self.table}
        WHERE {where} AND campaign IS NOT NULL
        GROUP BY campaign_type
        ORDER BY revenue DESC
        LIMIT 10
        """
        current_rows = self._run(sql_current, params)
        
        # Get previous period for comparison
        prev_f = f.previous_period()
        where_prev, params_prev = self._where(prev_f)
        
        sql_prev = f"""
        SELECT
            COALESCE(campaign, 'Direct') AS campaign_type,
            SUM(CAST(revenue AS FLOAT64)) AS revenue
        FROM {self.table}
        WHERE {where_prev} AND campaign IS NOT NULL
        GROUP BY campaign_type
        """
        prev_rows = self._run(sql_prev, params_prev)
        
        # Create lookup for previous revenue
        prev_revenue = {row['campaign_type']: row['revenue'] for row in prev_rows}
        
        # Build result with trends
        result = []
        for row in current_rows:
            r = dict(row)
            campaign = r['campaign_type']
            curr_rev = r.get('revenue', 0) or 0
            prev_rev = prev_revenue.get(campaign, 0) or 0
            
            # Calculate trend
            if prev_rev == 0:
                trend = "→"
            else:
                change = (curr_rev - prev_rev) / prev_rev
                if change > 0.05:
                    trend = "↑"
                elif change < -0.05:
                    trend = "↓"
                else:
                    trend = "→"
            
            logger.info(f"📈 {campaign}: curr={curr_rev:.0f}, prev={prev_rev:.0f}, change={change*100:.1f}%, trend={trend}")
            r['trend'] = trend
            result.append(r)
        
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ========================================================= filter options
    def filter_options(self) -> dict[str, list[str]]:
        """Get available filter values for App CR."""
        return {
            "platforms": ["All", "Android", "iOS"],
            "users": ["All", "First-time", "Returning"],
        }