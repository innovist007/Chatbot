# app/services/promo_basket_service.py

"""Direct BigQuery queries for Promo Basket dashboard."""

from __future__ import annotations

import hashlib
import json
import logging
import redis

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class PromoBasketFilters:
    start_date: date
    end_date: date
    compare_mode: str = "mom"

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def compare_period(self) -> "PromoBasketFilters":

        if self.compare_mode == "dod":
            return PromoBasketFilters(
                start_date=self.start_date - timedelta(days=1),
                end_date=self.end_date - timedelta(days=1),
                compare_mode=self.compare_mode,
            )

        if self.compare_mode == "wow":
            return PromoBasketFilters(
                start_date=self.start_date - timedelta(days=7),
                end_date=self.end_date - timedelta(days=7),
                compare_mode=self.compare_mode,
            )

        if self.compare_mode == "yoy":
            return PromoBasketFilters(
                start_date=self.start_date.replace(year=self.start_date.year - 1),
                end_date=self.end_date.replace(year=self.end_date.year - 1),
                compare_mode=self.compare_mode,
            )

        # default MOM
        return PromoBasketFilters(
            start_date=self.start_date - timedelta(days=30),
            end_date=self.end_date - timedelta(days=30),
            compare_mode=self.compare_mode,
        )

    def cache_key(self, prefix: str) -> str:

        parts = [
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.compare_mode,
        ]

        raw = "|".join(parts)

        key_hash = hashlib.md5(raw.encode()).hexdigest()[:12]

        return f"promobasket:{prefix}:{key_hash}"


class PromoBasketService:

    def __init__(self, settings: Settings) -> None:

        self.settings = settings

        self.client = bigquery.Client(
            project=settings.gcp_project_id
        )

        self.table = "`innovist-master-data.shopify.products_table`"

        try:
            self.redis_client = redis.Redis(
                host="localhost",
                port=6379,
                db=0,
                decode_responses=True,
                socket_connect_timeout=2,
            )

            self.redis_client.ping()

            self.cache_enabled = True

            logger.info("✅ Redis connected")

        except Exception as e:

            logger.warning(f"Redis unavailable: {e}")

            self.redis_client = None
            self.cache_enabled = False

    # ========================================================= cache

    def _get_cache(self, key: str) -> Any | None:

        if not self.cache_enabled:
            return None

        try:
            data = self.redis_client.get(key)

            if data:
                return json.loads(data)

            return None

        except Exception:
            return None

    def _set_cache(
        self,
        key: str,
        value: Any,
        ttl: int = 3600,
    ) -> None:

        if not self.cache_enabled:
            return

        try:
            self.redis_client.setex(
                key,
                ttl,
                json.dumps(value, default=str),
            )

        except Exception:
            pass

    # ========================================================= helpers

    def _run(
        self,
        sql: str,
        params: list,
    ) -> list[dict[str, Any]]:

        cfg = bigquery.QueryJobConfig(
            query_parameters=params
        )

        rows = self.client.query(
            sql,
            job_config=cfg,
        ).result()

        out = []

        for r in rows:

            d = dict(r)

            for k, v in d.items():

                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()

            out.append(d)

        return out

    def _order_cte(self, f: PromoBasketFilters) -> tuple[str, list]:

        params = [
            bigquery.ScalarQueryParameter(
                "start_date",
                "DATE",
                f.start_date,
            ),
            bigquery.ScalarQueryParameter(
                "end_date",
                "DATE",
                f.end_date,
            ),
        ]

        cte = f"""
        WITH orders AS (

            SELECT
                name AS order_name,

                ANY_VALUE(discount_code) AS discount_code,

                MAX(
                    SAFE_CAST(total_price AS NUMERIC)
                ) AS total_price,

                MAX(
                    SAFE_CAST(total_discounts AS NUMERIC)
                ) AS total_discounts,

                SUM(quantity) AS total_items

            FROM {self.table}

            WHERE DATE(created_at_timestamp)
                BETWEEN @start_date AND @end_date

            GROUP BY name
        )
        """

        return cte, params

    # ========================================================= latest date

    def get_latest_date(self) -> date | None:

        cache_key = "promobasket:latest_date"

        cached = self._get_cache(cache_key)

        if cached:
            return date.fromisoformat(cached)

        sql = f"""
        SELECT
            MAX(DATE(created_at_timestamp)) AS latest_date
        FROM {self.table}
        """

        rows = self._run(sql, [])

        if not rows:
            return None

        latest = rows[0].get("latest_date")

        if not latest:
            return None

        latest = date.fromisoformat(latest)

        self._set_cache(
            cache_key,
            latest.isoformat(),
            ttl=3600,
        )

        return latest

    # ========================================================= overview

    def _overview_agg(
        self,
        f: PromoBasketFilters,
    ) -> dict[str, Any]:

        cache_key = f.cache_key("overview_agg")

        cached = self._get_cache(cache_key)

        if cached:
            return cached

        cte, params = self._order_cte(f)

        sql = f"""
{cte}

SELECT

    COUNT(DISTINCT order_name) AS orders,

    SUM(total_price) AS revenue,

    SAFE_DIVIDE(
        SUM(total_price),
        COUNT(DISTINCT order_name)
    ) AS aov,

    SAFE_DIVIDE(
        SUM(total_items),
        COUNT(DISTINCT order_name)
    ) AS items_per_order,

    SAFE_DIVIDE(
        COUNT(DISTINCT CASE
            WHEN discount_code IS NOT NULL
            THEN order_name
        END),
        COUNT(DISTINCT order_name)
    )  AS coupon_usage,

    SAFE_DIVIDE(
        SUM(total_discounts),
        SUM(total_discounts) + SUM(total_price)
    ) * 100 AS discount_pct

FROM orders
"""

        rows = self._run(sql, params)

        result = rows[0] if rows else {}

        self._set_cache(
            cache_key,
            result,
            ttl=1800,
        )

        return result

    @staticmethod
    def _delta(
        curr: dict,
        prev: dict,
    ) -> dict:

        keys = [
            "orders",
            "revenue",
            "aov",
            "items_per_order",
            "coupon_usage",
            "discount_pct",
        ]

        out = {}

        for k in keys:

            c = curr.get(k) or 0
            p = prev.get(k) or 0

            out[k] = ((c - p) / p) if p else None

        return out

    def overview(
        self,
        f: PromoBasketFilters,
    ) -> dict[str, Any]:

        cache_key = f.cache_key("overview")

        cached = self._get_cache(cache_key)

        if cached:
            return cached

        curr = self._overview_agg(f)

        prev = self._overview_agg(
            f.compare_period()
        )

        result = {
            "current": {
                **curr,

                "cart_abandonment": None,
                "recovered_carts": None,
                "bundle_attach": None,
                "bogo_orders": None,
            },

            "previous": prev,

            "deltas": self._delta(curr, prev),

            "compare_label": f"vs {f.compare_mode}",
        }

        self._set_cache(
            cache_key,
            result,
            ttl=1800,
        )

        return result

    # ========================================================= coupon performance

    def coupon_performance(
        self,
        f: PromoBasketFilters,
    ) -> list[dict[str, Any]]:

        cache_key = f.cache_key("coupon_perf")

        cached = self._get_cache(cache_key)

        if cached:
            return cached

        cte, params = self._order_cte(f)

        sql = f"""
        {cte}

        SELECT

            discount_code AS code,

            COUNT(DISTINCT order_name) AS orders,

            SAFE_DIVIDE(
                SUM(total_price),
                COUNT(DISTINCT order_name)
            ) AS aov,

            SAFE_DIVIDE(
                SUM(total_discounts),
                SUM(total_discounts) + SUM(total_price)
            )  AS discount,

            NULL AS redemptions,

            NULL AS cm_impact

        FROM orders

        WHERE discount_code IS NOT NULL
          

        GROUP BY code

        ORDER BY orders DESC LIMIT 10

        
        """

        result = self._run(sql, params)

        self._set_cache(
            cache_key,
            result,
            ttl=3600,
        )

        return result

    # ========================================================= basket distribution

    def basket_distribution(
        self,
        f: PromoBasketFilters,
    ) -> list[dict[str, Any]]:

        cache_key = f.cache_key("basket_dist")

        cached = self._get_cache(cache_key)

        if cached:
            return cached

        cte, params = self._order_cte(f)

        sql = f"""
        {cte}

        SELECT

            CASE
                WHEN total_items = 1 THEN '1 item'
                WHEN total_items = 2 THEN '2 items'
                WHEN total_items = 3 THEN '3 items'
                ELSE '4+ items'
            END AS items,

            COUNT(DISTINCT order_name) AS orders,

            SAFE_DIVIDE(
                COUNT(DISTINCT order_name),
                SUM(COUNT(DISTINCT order_name)) OVER()
            )  AS share,

            AVG(total_price) AS aov

        FROM orders

        GROUP BY items

        ORDER BY orders DESC
        """

        result = self._run(sql, params)

        self._set_cache(
            cache_key,
            result,
            ttl=3600,
        )

        return result

    # ========================================================= discount depth

    def discount_depth_distribution(
        self,
        f: PromoBasketFilters,
    ) -> list[dict[str, Any]]:

        cache_key = f.cache_key("discount_depth")

        cached = self._get_cache(cache_key)

        if cached:
            return cached

        cte, params = self._order_cte(f)

        sql = f"""
        {cte},

       
discount_base AS (

    SELECT

        *,

        SAFE_DIVIDE(
            total_discounts,
            total_price
        ) * 100 AS discount_depth

    FROM orders
),
total_orders AS (

    SELECT
        COUNT(DISTINCT order_name) AS total_orders
    FROM orders
)


        SELECT

    CASE
        WHEN discount_depth = 0 THEN '0%'
        WHEN discount_depth <= 10 THEN '1-10%'
        WHEN discount_depth <= 20 THEN '11-20%'
        WHEN discount_depth <= 30 THEN '21-30%'
        ELSE '30%+'
    END AS depth,

    COUNT(DISTINCT order_name) AS orders,

    SAFE_DIVIDE(
    COUNT(DISTINCT order_name),
    SUM(COUNT(DISTINCT order_name)) OVER()
)  AS share,

    NULL AS rto_pct

FROM discount_base

GROUP BY depth

ORDER BY orders DESC
        """

        result = self._run(sql, params)

        self._set_cache(
            cache_key,
            result,
            ttl=3600,
        )

        return result