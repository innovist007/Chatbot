"""D2C RTO service - Return To Origin analytics."""
from __future__ import annotations
import json
import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import redis
from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class D2CRtoFilters:
    """Filters for D2C RTO queries."""
    start_date: date
    end_date: date
    payment: str | None = None  # COD, Prepaid, or None for All
    customer: str | None = None  # New, Repeat, or None for All
    compare_mode: str = "MoM"
    
    def cache_key(self, prefix: str) -> str:
        """Generate cache key for these filters."""
        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.payment or "all",
            self.customer or "all",
            self.compare_mode,
        ]
        return ":".join(parts)


def previous_period(start: date, end: date, mode: str = "MoM") -> tuple[date, date]:
    """Calculate previous comparison period based on mode."""
    days = (end - start).days
    
    if mode == "DoD":
        return (start - timedelta(days=days + 1), start - timedelta(days=1))
    elif mode == "WoW":
        return (start - timedelta(days=7), end - timedelta(days=7))
    elif mode == "MoM":
        return (start - timedelta(days=30), end - timedelta(days=30))
    elif mode == "YoY":
        return (start - timedelta(days=365), end - timedelta(days=365))
    else:
        return (start - timedelta(days=days + 1), start - timedelta(days=1))


class D2CRtoService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        self.table = "`innovist-master-data.shopify.v_clickpost_by_shopify`"
        
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
            logger.info("✅ Redis cache connected for D2C RTO")
        except Exception as e:
            logger.warning(f"⚠️  Redis unavailable: {e}")
            self.redis_client = None
            self.cache_enabled = False
    
    def _get_cache(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            data = self.redis_client.get(key)
            if data:
                logger.info(f"🎯 Cache HIT: {key}")
                return json.loads(data)
            logger.info(f"❌ Cache MISS: {key}")
            return None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None
    
    def _set_cache(self, key: str, value: Any, ttl: int = 3600) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info(f"💾 Cache SET: {key} (TTL: {ttl}s)")
        except Exception as e:
            logger.error(f"Cache set error: {e}")
    
    def _run(self, sql: str, params: list) -> list[dict]:
        """Run BigQuery query and return results as list of dicts."""
        cfg = bigquery.QueryJobConfig(query_parameters=params) if params else None
        rows = self.client.query(sql, job_config=cfg).result()
        return [dict(row) for row in rows]
    
    def _where(self, f: D2CRtoFilters) -> tuple[str, list]:
        """Build WHERE clause and parameters."""
        conditions = ["created_date_in_timezone BETWEEN @start_date AND @end_date"]
        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        
        if f.payment and f.payment != "All":
            conditions.append("UPPER(payment_mode) = UPPER(@payment)")
            params.append(bigquery.ScalarQueryParameter("payment", "STRING", f.payment))
        
        if f.customer and f.customer != "All":
            # Map "First-time" to "New" if needed
            customer_value = "New" if f.customer == "First-time" else f.customer
            conditions.append("Customer_type = @customer")
            params.append(bigquery.ScalarQueryParameter("customer", "STRING", customer_value))
        
        return " AND ".join(conditions), params
    
    def _aggregates(self, f: D2CRtoFilters) -> dict:
        """Get aggregate RTO metrics for a date range."""
        where, params = self._where(f)
        
        sql = f"""
        SELECT
            COUNT(DISTINCT order_name) AS total_orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'RTO' THEN order_name END) AS rto_orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'DELIVERED' THEN order_name END) AS delivered_orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'CANCELLED' THEN order_name END) AS cancelled_orders,
            AVG(CASE WHEN UPPER(Shipment_status) = 'RTO' THEN total_price END) AS avg_rto_aov,
            SUM(CASE WHEN UPPER(Shipment_status) = 'RTO' THEN total_price ELSE 0 END) AS rto_value
        FROM {self.table}
        WHERE {where}
        """
        
        rows = self._run(sql, params)
        if not rows:
            return {}
        
        return rows[0]
    
    def _derive(self, agg: dict) -> dict:
        """Derive metrics from aggregates."""
        total = int(agg.get("total_orders") or 0)
        rto = int(agg.get("rto_orders") or 0)
        delivered = int(agg.get("delivered_orders") or 0)
        cancelled = int(agg.get("cancelled_orders") or 0)
        
        return {
            "total_orders": total,
            "rto_orders": rto,
            "delivered_orders": delivered,
            "cancelled": cancelled,
            "rto_pct": rto / total if total else 0,
            "delivery_rate": delivered / total if total else 0,
            "cancellation_rate": cancelled / total if total else 0,
            "rto_value": float(agg.get("rto_value") or 0),
            "avg_rto_aov": float(agg.get("avg_rto_aov") or 0),
            # Placeholders for now - we'll add when data is available
            "rto_loss": 0,
            "loss_per_rto": 0,
            "rto_tat_days": 0,
            "inventory_locked": 0,
        }
    
    def overview(self, f: D2CRtoFilters) -> dict:
        """Get overview KPIs with current vs previous comparison."""
        cache_key = f.cache_key("rto_overview")
        cached = self._get_cache(cache_key)
        if cached:
            return cached
        
        # Current period
        curr = self._derive(self._aggregates(f))
        
        # Previous period
        prev_start, prev_end = previous_period(f.start_date, f.end_date, f.compare_mode)
        prev_filters = D2CRtoFilters(
            start_date=prev_start,
            end_date=prev_end,
            payment=f.payment,
            customer=f.customer,
            compare_mode=f.compare_mode,
        )
        prev = self._derive(self._aggregates(prev_filters))
        
        # Calculate deltas
        deltas = {}
        for key in ["rto_pct", "rto_orders", "delivered_orders", "cancelled", "rto_value", "loss_per_rto"]:
            curr_val = curr.get(key, 0)
            prev_val = prev.get(key, 0)
            if key in ("rto_pct", "delivery_rate", "cancellation_rate"):
                # Percentage point change
                deltas[key] = curr_val - prev_val
            elif prev_val != 0:
                # Percentage change
                deltas[key] = (curr_val - prev_val) / prev_val
            else:
                deltas[key] = 0
        
        result = {
            "current": curr,
            "deltas": deltas,
            "compare_label": f.compare_mode,
        }
        
        self._set_cache(cache_key, result, ttl=3600)
        return result
    
    def payment_split(self, f: D2CRtoFilters) -> list[dict]:
        """RTO breakdown by payment mode."""
        cache_key = f.cache_key("rto_payment_split")
        cached = self._get_cache(cache_key)
        if cached:
            return cached
        
        where, params = self._where(f)
        
        sql = f"""
        SELECT
            COALESCE(payment_mode, 'Unknown') AS payment,
            COUNT(DISTINCT order_name) AS orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'RTO' THEN order_name END) AS rto_orders,
            AVG(CASE WHEN UPPER(Shipment_status) = 'RTO' THEN total_price END) AS avg_rto_aov
        FROM {self.table}
        WHERE {where}
        AND payment_mode IS NOT NULL
        AND UPPER(payment_mode) IN ('COD', 'PREPAID')
        GROUP BY payment_mode
        ORDER BY orders DESC
        """
        
        rows = self._run(sql, params)
        result = []
        for row in rows:
            orders = int(row.get("orders") or 0)
            rto = int(row.get("rto_orders") or 0)
            avg_aov = float(row.get("avg_rto_aov") or 0)
            result.append({
                "payment": row.get("payment"),
                "orders": orders,
                "rto_pct": rto / orders if orders else 0,
                "avg_loss_per_rto": 0,  # Placeholder - need shipping cost data
                "total_loss": 0,  # Placeholder
            })
        
        self._set_cache(cache_key, result, ttl=3600)
        return result
    
    def by_tier(self, f: D2CRtoFilters) -> list[dict]:
        """RTO breakdown by pincode tier."""
        cache_key = f.cache_key("rto_by_tier")
        cached = self._get_cache(cache_key)
        if cached:
            return cached
        
        where, params = self._where(f)
        
        sql = f"""
        SELECT
            COALESCE(Tier, 'Unknown') AS tier,
            COUNT(DISTINCT order_name) AS orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'RTO' THEN order_name END) AS rto_orders,
            AVG(total_price) AS avg_aov
        FROM {self.table}
        WHERE {where}
        AND Tier IS NOT NULL
        GROUP BY Tier
        ORDER BY orders DESC
        """
        
        rows = self._run(sql, params)
        
        # Calculate total orders for mix percentage
        total_orders = sum(int(r.get("orders") or 0) for r in rows)
        
        result = []
        for row in rows:
            orders = int(row.get("orders") or 0)
            rto = int(row.get("rto_orders") or 0)
            avg_aov = float(row.get("avg_aov") or 0)
            result.append({
                "tier": row.get("tier"),
                "orders": orders,
                "mix_pct": orders / total_orders if total_orders else 0,
                "rto_pct": rto / orders if orders else 0,
                "loss": None,  # Placeholder
                "avg_aov": avg_aov,
            })
        
        self._set_cache(cache_key, result, ttl=3600)
        return result
    
    def top_pincodes(self, f: D2CRtoFilters, limit: int = 10) -> list[dict]:
        """Top RTO pincodes."""
        cache_key = f.cache_key(f"rto_top_pincodes_{limit}")
        cached = self._get_cache(cache_key)
        if cached:
            return cached
        
        where, params = self._where(f)
        
        sql = f"""
        SELECT
            drop_pincode AS pincode,
            COALESCE(drop_city, 'Unknown') AS location,
            COUNT(DISTINCT order_name) AS orders,
            COUNT(DISTINCT CASE WHEN UPPER(Shipment_status) = 'RTO' THEN order_name END) AS rto_orders,
            AVG(total_price) AS avg_aov,
            SUM(CASE WHEN UPPER(Shipment_status) = 'RTO' THEN total_price ELSE 0 END) AS rto_value
        FROM {self.table}
        WHERE {where}
        AND drop_pincode IS NOT NULL
        GROUP BY drop_pincode, drop_city
        HAVING COUNT(DISTINCT order_name) >= 50
        ORDER BY rto_orders DESC, COUNT(DISTINCT order_name) DESC
        LIMIT {limit}
        """
        
        rows = self._run(sql, params)
        result = []
        for row in rows:
            orders = int(row.get("orders") or 0)
            rto = int(row.get("rto_orders") or 0)
            result.append({
                "pincode": row.get("pincode"),
                "location": row.get("location"),
                "orders": orders,
                "rto_pct": rto / orders if orders else 0,
                "loss": float(row.get("rto_value") or 0),  # Using RTO order value as proxy
                "avg_aov": float(row.get("avg_aov") or 0),
            })
        
        self._set_cache(cache_key, result, ttl=3600)
        return result
    
    def get_latest_date(self) -> date | None:
        """Get the most recent date with data."""
        cache_key = "d2c_rto:latest_date"
        cached = self._get_cache(cache_key)
        if cached:
            return date.fromisoformat(cached) if isinstance(cached, str) else cached
        
        sql = f"""
        SELECT MAX(created_date_in_timezone) AS latest_date
        FROM {self.table}
        """
        
        rows = self._run(sql, [])
        if not rows or not rows[0].get("latest_date"):
            return None
        
        latest = rows[0]["latest_date"]
        self._set_cache(cache_key, latest.isoformat() if hasattr(latest, 'isoformat') else str(latest), ttl=3600)
        return latest