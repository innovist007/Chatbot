"""D2C service for all D2C section tabs with Redis caching.

This service powers the D2C section which includes:
- Overview tab (high-level D2C metrics)
- Web CR tab (see app/modules/web_cr/)
- App CR tab
- D2C RTO tab
- Repeat & retention tab
- Promo & basket tab

For now, this service handles the Overview tab data.
"""
from __future__ import annotations

import logging
import json
import redis
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import ANALYTICS_TTL, Settings, make_cache_key

logger = logging.getLogger(__name__)


@dataclass
class D2CFilters:
    start_date: date
    end_date: date
    brands: list[str] | None = None
    platforms: list[str] | None = None  # Web, App
    customers: list[str] | None = None  # New, Returning

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "D2CFilters":
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))
    
    def cache_key(self, prefix: str) -> str:
        return make_cache_key(
            "d2c", prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            ",".join(sorted(self.brands     or [])),
            ",".join(sorted(self.platforms  or [])),
            ",".join(sorted(self.customers  or [])),
        )


class D2CService:
    """Service for D2C section (all tabs)."""
    
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        # TODO: Replace with your actual D2C orders table
        self.table = "`innovist-master-data.shopify.v_order_table`"
        
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
            logger.info("✅ Redis cache connected (D2C service)")
            print("✅ Redis cache connected (D2C service)")
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
    
    def _set_cache(self, key: str, value: Any, ttl: int = ANALYTICS_TTL) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info(f"💾 Cache SET: {key} (TTL: {ttl}s)")
            print(f"💾 Cache SET: {key} (TTL: {ttl}s)")
        except Exception as e:
            logger.error(f"Cache error: {e}")

    # ------------------------------------------------------------------ helpers
    def _where(self, f: D2CFilters) -> tuple[str, list]:
        # If created_date is INT64 (unix timestamp in seconds), convert to DATE
        # If created_date is already DATE type, use it directly
        # Try: CAST(created_date AS DATE) for both cases
        clauses = ["CAST(created_date_in_timezone AS DATE) BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.brands:
            clauses.append("brand IN UNNEST(@brands)")
            params.append(bigquery.ArrayQueryParameter("brands", "STRING", f.brands))
        if f.platforms:
            clauses.append("Platform IN UNNEST(@platforms)")
            params.append(bigquery.ArrayQueryParameter("platforms", "STRING", f.platforms))
        if f.customers:
            clauses.append("cust_type IN UNNEST(@customers)")
            params.append(bigquery.ArrayQueryParameter("customers", "STRING", f.customers))
        return " AND ".join(clauses), params

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        logger.info("🔍 Executing BigQuery query (D2C)...")
        print("🔍 Executing BigQuery query (D2C)...")
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
    def _aggregates(self, f: D2CFilters) -> dict[str, float]:
        cache_key = f.cache_key("agg")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            COUNT(DISTINCT id) AS orders,
            SUM(total_price) AS revenue,
            SUM(total_discounts) AS discounts,
            COUNT(DISTINCT customer_id) AS customers,
            COUNT(DISTINCT CASE WHEN shipment_status = 'delivered' THEN id END) AS delivered_orders,
            COUNT(DISTINCT CASE WHEN shipment_status = 'cancelled' THEN id END) AS cancelled_orders,
            COUNT(DISTINCT CASE WHEN Modes_of_payments = 'Prepaid' THEN id END) AS prepaid_orders,
            COUNT(DISTINCT CASE WHEN Platform = 'New_platform' THEN id END) AS app_orders,
            COUNT(DISTINCT CASE WHEN Platform != 'New_platform' THEN id END) AS web_orders,
            COUNT(DISTINCT created_date) AS days
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        result = {k: (v or 0) for k, v in (rows[0] if rows else {}).items()}
        
        self._set_cache(cache_key, result)
        return result

    @staticmethod
    def _derive(a: dict[str, float]) -> dict[str, float]:
        """Derive calculated metrics from raw aggregates."""
        orders = a.get("orders") or 0
        revenue = a.get("revenue") or 0
        discounts = a.get("discounts") or 0
        customers = a.get("customers") or 0
        delivered = a.get("delivered_orders") or 0
        cancelled = a.get("cancelled_orders") or 0
        prepaid = a.get("prepaid_orders") or 0
        app_orders = a.get("app_orders") or 0
        web_orders = a.get("web_orders") or 0
        days = a.get("days") or 1

        out = dict(a)
        
        # Net revenue (after discounts)
        out["net_revenue"] = revenue - discounts
        
        # AOV
        out["aov"] = (revenue / orders) if orders else 0
        
        # Discount %
        out["discount_pct"] = (discounts / revenue) if revenue else 0
        
        # Delivery rate
        out["delivery_rate"] = (delivered / orders) if orders else 0
        
        # RTO rate (cancelled / orders)
        out["rto_rate"] = (cancelled / orders) if orders else 0
        
        # Prepaid %
        out["prepaid_pct"] = (prepaid / orders) if orders else 0
        
        # App revenue share
        out["app_revenue_share"] = (app_orders / orders) if orders else 0
        
        # Daily averages
        out["daily_avg_orders"] = orders / days
        out["daily_avg_revenue"] = revenue / days
        
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = [
            "orders", "revenue", "net_revenue", "aov", "discount_pct",
            "delivery_rate", "rto_rate", "prepaid_pct", "app_revenue_share",
            "daily_avg_orders", "daily_avg_revenue",
        ]
        out = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            out[k] = ((c - p) / p) if p else None
        return out

    # ============================================== D2C OVERVIEW TAB
    def overview(self, f: D2CFilters) -> dict[str, Any]:
        """Get D2C Overview tab metrics."""
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
        
        self._set_cache(cache_key, result)
        return result

    # ============================================================ by platform
    def by_platform(self, f: D2CFilters) -> list[dict[str, Any]]:
        """Web vs App comparison for Overview tab."""
        cache_key = f.cache_key("by_platform")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            CASE 
                WHEN Platform = 'New_platform' THEN 'App'
                ELSE 'Web'
            END AS platform,
            COUNT(DISTINCT id) AS orders,
            SUM(total_price) AS revenue,
            AVG(total_price) AS aov,
            COUNT(DISTINCT CASE WHEN shipment_status = 'delivered' THEN id END) / NULLIF(COUNT(DISTINCT id), 0) AS delivery_rate,
            COUNT(DISTINCT CASE WHEN shipment_status = 'cancelled' THEN id END) / NULLIF(COUNT(DISTINCT id), 0) AS rto_rate,
            COUNT(DISTINCT CASE WHEN Modes_of_payments = 'Prepaid' THEN id END) / NULLIF(COUNT(DISTINCT id), 0) AS prepaid_pct
        FROM {self.table}
        WHERE {where}
        GROUP BY platform
        ORDER BY revenue DESC
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    # ============================================================ daily trend
    def revenue_trend(self, f: D2CFilters) -> list[dict[str, Any]]:
        """Daily revenue trend for Overview tab chart."""
        cache_key = f.cache_key("revenue_trend")
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached
        
        where, params = self._where(f)
        sql = f"""
        SELECT
            created_date AS date,
            SUM(CASE WHEN Platform != 'New_platform' THEN total_price ELSE 0 END) AS web_revenue,
            SUM(CASE WHEN Platform = 'New_platform' THEN total_price ELSE 0 END) AS app_revenue,
            SUM(total_price) AS total_revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    # ========================================================= filter options
    def filter_options(self) -> dict[str, list[str]]:
        """Get available filter values for D2C section."""
        cols = {"brands": "brand", "platforms": "Platform", "customers": "cust_type"}
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
                logger.warning("d2c filter %s failed: %s", col, e)
                out[key] = []
        return out