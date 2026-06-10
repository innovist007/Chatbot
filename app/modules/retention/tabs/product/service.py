from __future__ import annotations

from typing import Any

from google.cloud import bigquery

from app.modules.retention.base import (
    CO_PURCHASE, CUSTOMER_DIM, ORDER_FACT, RetentionBase,
)
from app.modules.retention.filters import RetentionFilters, WINDOW_DAYS


class ProductService(RetentionBase):

    def product_table(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("product_table")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        sql = f"""
SELECT
  cd.acquisition_product                                  AS product,
  cd.cohort_month,
  COUNT(DISTINCT cd.phone_num)                            AS acquired,
  COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL))
                                                          AS retained_30d,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL)),
    COUNT(DISTINCT cd.phone_num)) * 100, 2)               AS retention_rate_30d
FROM   {CUSTOMER_DIM} cd
LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
WHERE  {where_cd}
GROUP BY cd.acquisition_product, cd.cohort_month
HAVING COUNT(DISTINCT cd.phone_num) >= 50
ORDER BY COUNT(DISTINCT cd.phone_num) DESC, cd.cohort_month
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def cross_sell(
        self, f: RetentionFilters, window: str = "30d", fo_product: str | None = None
    ) -> list[dict[str, Any]]:
        win_days = WINDOW_DAYS.get(window, 30)
        ckey = f.cache_key(f"cross_sell_v2:{window}:{fo_product or 'all'}")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params.append(bigquery.ScalarQueryParameter("win_days", "INT64", win_days))

        fo_filter = ""
        if fo_product:
            fo_filter = "AND o1.primary_product = @fo_product"
            params.append(bigquery.ScalarQueryParameter("fo_product", "STRING", fo_product))

        sql = f"""
WITH ntb AS (
  SELECT COUNT(*) AS n
  FROM   {CUSTOMER_DIM} cd
  WHERE  {where_cd}
)
SELECT
  o2.primary_product                                      AS so_product,
  COUNT(DISTINCT o2.phone_num)                            AS so_count,
  (SELECT n FROM ntb)                                     AS ntb_total,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT o2.phone_num), (SELECT n FROM ntb)) * 100, 2)
                                                          AS pct_of_ntb
FROM   {ORDER_FACT} o1
JOIN   {ORDER_FACT} o2
  ON   o2.phone_num = o1.phone_num
  AND  o2.order_seq = 2
  AND  o2.days_since_prev_order <= @win_days
JOIN   {CUSTOMER_DIM} cd ON cd.phone_num = o1.phone_num AND {where_cd}
WHERE  o1.order_seq = 1
  {fo_filter}
GROUP BY o2.primary_product
ORDER BY so_count DESC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def fo_so_gap(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("fo_so_gap")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")

        sql = f"""
SELECT
  o.prev_product                                          AS fo_product,
  ROUND(APPROX_QUANTILES(o.days_since_prev_order, 100)[OFFSET(50)], 0) AS median_gap_days,
  ROUND(APPROX_QUANTILES(o.days_since_prev_order, 100)[OFFSET(25)], 0) AS p25_gap_days,
  ROUND(APPROX_QUANTILES(o.days_since_prev_order, 100)[OFFSET(75)], 0) AS p75_gap_days,
  COUNT(*)                                                AS so_orders
FROM   {ORDER_FACT} o
JOIN   {CUSTOMER_DIM} cd ON cd.phone_num = o.phone_num
WHERE  o.order_seq = 2
  AND  o.days_since_prev_order IS NOT NULL
  AND  {where_cd}
GROUP BY o.prev_product
HAVING COUNT(*) >= 10
ORDER BY median_gap_days ASC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def affinity_matrix(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("affinity_matrix")
        if hit := self._get(ckey):
            return hit

        PRODUCT_RETENTION = "`innovist-master-data.shopify.v_updated_prod_retention`"

        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]

        sql = f"""
WITH
order_products AS (
  SELECT DISTINCT
    name         AS order_id,
    product_name AS product_title
  FROM {PRODUCT_RETENTION}
  WHERE CAST(created_date AS DATE) BETWEEN @start_date AND @end_date
    AND product_name IS NOT NULL
),
product_order_counts AS (
  SELECT
    product_title,
    COUNT(DISTINCT order_id) AS orders_with_product
  FROM order_products
  GROUP BY product_title
),
co_purchase AS (
  SELECT
    a.product_title            AS product_a,
    b.product_title            AS product_b,
    COUNT(DISTINCT a.order_id) AS co_purchase_count
  FROM order_products a
  JOIN order_products b
    ON  a.order_id = b.order_id
    AND a.product_title < b.product_title
  GROUP BY a.product_title, b.product_title
)
SELECT
  c.product_a,
  c.product_b,
  c.co_purchase_count,
  pa.orders_with_product                                                    AS a_total_orders,
  pb.orders_with_product                                                    AS b_total_orders,
  ROUND(SAFE_DIVIDE(c.co_purchase_count, pa.orders_with_product) * 100, 1) AS pct_a_with_b,
  ROUND(SAFE_DIVIDE(c.co_purchase_count, pb.orders_with_product) * 100, 1) AS pct_b_with_a
FROM co_purchase c
LEFT JOIN product_order_counts pa ON pa.product_title = c.product_a
LEFT JOIN product_order_counts pb ON pb.product_title = c.product_b
ORDER BY c.co_purchase_count DESC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def return_rate(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("return_rate")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params += [
            bigquery.ScalarQueryParameter("start_date2", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date2",   "DATE", f.end_date),
        ]

        sql = f"""
WITH order_stats AS (
  SELECT
    primary_product                                       AS product,
    COUNT(*)                                              AS total_orders,
    COUNTIF(shipment_status IN ('returned','refunded','RTO'))
                                                          AS returned_orders,
    ROUND(SAFE_DIVIDE(COUNTIF(shipment_status IN ('returned','refunded','RTO')), COUNT(*)) * 100, 2)
                                                          AS return_rate_pct
  FROM   {ORDER_FACT}
  WHERE  order_date BETWEEN @start_date2 AND @end_date2
  GROUP BY primary_product
  HAVING COUNT(*) >= 50
),
gross_repeat AS (
  SELECT
    cd.acquisition_product                                AS product,
    COUNT(DISTINCT cd.phone_num)                          AS ntb_count,
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL))
                                                          AS retained_30d,
    ROUND(SAFE_DIVIDE(
      COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL)),
      COUNT(DISTINCT cd.phone_num)) * 100, 2)             AS gross_repeat_rate
  FROM   {CUSTOMER_DIM} cd
  LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
  WHERE  {where_cd}
  GROUP BY cd.acquisition_product
)
SELECT
  os.product,
  os.total_orders,
  os.returned_orders,
  os.return_rate_pct,
  gr.ntb_count,
  gr.gross_repeat_rate,
  ROUND(gr.gross_repeat_rate * (1 - os.return_rate_pct / 100), 2)
                                                          AS net_repeat_rate
FROM   order_stats os
LEFT JOIN gross_repeat gr ON gr.product = os.product
ORDER BY os.return_rate_pct DESC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result
