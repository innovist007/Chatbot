"""D2C Overview — KPI service querying dc_onestolabs.v_d2c_sales_ads and v_rto_analytics."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from functools import lru_cache
from typing import Any

import redis
from google.cloud import bigquery

from app.config import ANALYTICS_TTL, CACHE_V, Settings

logger = logging.getLogger(__name__)

SALES_TABLE = "`datachannel-238509.dc_onestolabs.v_d2c_sales_ads`"


def _sd(a, b):
    return a / b if b else None


class D2CSalesAdsService:

    def __init__(self, settings: Settings) -> None:
        self.client = bigquery.Client(project=settings.gcp_project_id)
        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host, port=settings.redis_port, db=0,
                decode_responses=True, socket_connect_timeout=2,
            )
            self.redis_client.ping()
        except Exception as exc:
            logger.warning("Redis unavailable for d2c_sales_ads: %s", exc)
            self.redis_client = None

    def _get_cache(self, key: str) -> Any | None:
        if not self.redis_client:
            return None
        try:
            data = self.redis_client.get(key)
            if data:
                logger.info("🎯 Cache HIT  [d2c_sales_ads]: %s", key)
                return json.loads(data)
            logger.info("❌ Cache MISS [d2c_sales_ads]: %s", key)
            return None
        except Exception:
            return None

    def _set_cache(self, key: str, value: Any) -> None:
        if not self.redis_client:
            return
        try:
            self.redis_client.setex(key, ANALYTICS_TTL, json.dumps(value, default=str))
            logger.info("💾 Cache SET  [d2c_sales_ads]: %s (ttl=%ss)", key, ANALYTICS_TTL)
        except Exception:
            pass

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        cfg  = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(sql, job_config=cfg, location="asia-south2").result()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    def kpis(self, start_date: date, end_date: date) -> dict[str, Any]:
        cache_key = f"d2c_sales_ads:{CACHE_V}:kpis:{start_date}:{end_date}"
        cached    = self._get_cache(cache_key)
        if cached:
            return cached

        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", end_date),
        ]

        sales_sql = f"""
        SELECT
          COALESCE(SUM(SAFE_DIVIDE(revenue, gst_mul)), 0)                   AS net_revenue,
          COALESCE(SUM(mrp_revenue), 0)                                      AS mrp_revenue,
          COALESCE(SUM(revenue), 0)                                          AS gross_revenue,
          COALESCE(SUM(
            COALESCE(total_fb_spend, 0) + COALESCE(g_ads_spent, 0) +
            COALESCE(crm_spent, 0) + COALESCE(pp_spent, 0) +
            COALESCE(hypd_spent, 0)
          ), 0)                                                               AS total_spend,
          COALESCE(SUM(cogs_amount), 0)                                      AS cogs,
          COALESCE(SUM(logistic_cost), 0)                                    AS logistics,
          COALESCE(SUM(units), 0)                                            AS total_units,
          COALESCE(SUM(order_count), 0)                                      AS total_orders
        FROM {SALES_TABLE}
        WHERE created_date_in_timezone BETWEEN @start_date AND @end_date
        """

        try:
            sales_rows = self._run(sales_sql, params)
        except Exception as exc:
            logger.warning("v_d2c_sales_ads query failed: %s", exc)
            sales_rows = []

        s = sales_rows[0] if sales_rows else {}

        net_revenue   = float(s.get("net_revenue")   or 0)
        mrp_revenue   = float(s.get("mrp_revenue")   or 0)
        gross_revenue = float(s.get("gross_revenue") or 0)
        total_spend   = float(s.get("total_spend")   or 0)
        cogs          = float(s.get("cogs")          or 0)
        logistics     = float(s.get("logistics")     or 0)
        total_units   = float(s.get("total_units")   or 0)
        total_orders  = float(s.get("total_orders")  or 0)

        cm2          = gross_revenue - cogs - logistics - total_spend
        discount_abs = mrp_revenue - gross_revenue

        result = {
            "net_revenue":        net_revenue,
            "mrp_revenue":        mrp_revenue,
            "gross_revenue":      gross_revenue,
            "total_spend":        total_spend,
            "cogs":               cogs,
            "logistics":          logistics,
            "total_units":        total_units,
            "total_orders":       total_orders,
            "cm2":                cm2,
            "cm2_pct":            _sd(cm2, net_revenue),
            "discount_pct":       _sd(discount_abs, mrp_revenue),
            "asp":                _sd(gross_revenue, total_units),
            "aov":                _sd(gross_revenue, total_orders),
            "true_cm_per_order":  _sd(cm2, total_orders),
            "spend_per_order":    _sd(total_spend, total_orders),
        }
        self._set_cache(cache_key, result)
        return result
