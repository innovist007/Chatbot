from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

import redis
from google.cloud import bigquery

from app.config import ANALYTICS_TTL, Settings
from app.modules.retention.filters import RetentionFilters

logger = logging.getLogger(__name__)

ORDER_FACT   = "`innovist-master-data.shopify.v_order_fact`"
CUSTOMER_DIM = "`innovist-master-data.shopify.v_customer_dim`"
COHORT_CAC   = "`innovist-master-data.shopify.v_cohort_cac`"
SKU_CAC      = "`innovist-master-data.shopify.v_sku_cac`"
CO_PURCHASE  = "`innovist-master-data.shopify.v_co_purchase_matrix`"
CHANNEL_CAC  = "`innovist-master-data.shopify.v_channel_cac`"


class RetentionBase:
    """Shared BigQuery + Redis infrastructure for all retention tab services."""

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
            logger.warning("Redis unavailable for retention: %s", exc)
            self.redis_client = None
            self.cache_enabled = False

    # ------------------------------------------------------------------ cache

    def _get(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            raw = self.redis_client.get(key)
            if raw:
                logger.info("🎯 Cache HIT  [retention]: %s", key)
                return json.loads(raw)
            logger.info("❌ Cache MISS [retention]: %s", key)
            return None
        except Exception:
            return None

    def _set(self, key: str, value: Any, ttl: int = ANALYTICS_TTL) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info("💾 Cache SET  [retention]: %s (ttl=%ss)", key, ttl)
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

    # ------------------------------------------------------------------ shared param builders

    def _base_params(self, f: RetentionFilters) -> tuple[str, list]:
        clauses = ["first_order_date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]
        if f.brands:
            clauses.append("acquisition_brand IN UNNEST(@brands)")
            params.append(bigquery.ArrayQueryParameter("brands", "STRING", f.brands))
        return " AND ".join(clauses), params

    def _base_params_aliased(self, f: RetentionFilters, alias: str) -> tuple[str, list]:
        clauses = [f"{alias}.first_order_date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]
        if f.brands:
            clauses.append(f"{alias}.acquisition_brand IN UNNEST(@brands)")
            params.append(bigquery.ArrayQueryParameter("brands", "STRING", f.brands))
        return " AND ".join(clauses), params

    def _cohort_cac_params(self, f: RetentionFilters) -> list:
        return [
            bigquery.ScalarQueryParameter("cohort_start", "STRING", f.cohort_start),
            bigquery.ScalarQueryParameter("cohort_end",   "STRING", f.cohort_end),
        ]
