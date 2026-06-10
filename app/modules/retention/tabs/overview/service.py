from __future__ import annotations

from typing import Any

from google.cloud import bigquery

from app.modules.retention.base import (
    COHORT_CAC, CUSTOMER_DIM, ORDER_FACT, RetentionBase,
)
from app.modules.retention.filters import RetentionFilters


class OverviewService(RetentionBase):

    def key_metrics(self, f: RetentionFilters) -> dict[str, Any]:
        ckey = f.cache_key("key_metrics")
        if hit := self._get(ckey):
            return hit

        where, params = self._base_params(f)
        params += self._cohort_cac_params(f)

        sql = f"""
WITH cohort AS (
  SELECT phone_num
  FROM   {CUSTOMER_DIM}
  WHERE  {where}
),
ntb AS (
  SELECT COUNT(*) AS n FROM cohort
),
all_orders AS (
  SELECT o.phone_num, o.order_id, o.order_value, o.order_seq, o.days_since_first_order
  FROM   {ORDER_FACT} o
  WHERE  o.phone_num IN (SELECT phone_num FROM cohort)
    AND  o.order_id IS NOT NULL
),
aov_oc1 AS (
  SELECT
    SUM(order_value) AS total_revenue,
    COUNT(order_id)  AS total_orders
  FROM all_orders
  WHERE order_seq = 1
),
aof AS (
  SELECT COUNT(order_id) AS total_orders
  FROM all_orders
),
ltv_90 AS (
  SELECT SUM(order_value) AS total
  FROM all_orders
  WHERE days_since_first_order <= 90
),
repeat_30 AS (
  SELECT COUNT(DISTINCT phone_num) AS cnt
  FROM all_orders
  WHERE order_seq = 2
    AND days_since_first_order <= 30
),
loyal AS (
  SELECT COUNTIF(order_count_segment = '3+_orders') AS cnt
  FROM   {CUSTOMER_DIM}
  WHERE  phone_num IN (SELECT phone_num FROM cohort)
),
cac_data AS (
  SELECT AVG(cac) AS avg_cac
  FROM   {COHORT_CAC}
  WHERE  cohort_month BETWEEN @cohort_start AND @cohort_end
)
SELECT
  (SELECT n FROM ntb)                         AS ntb_customers,
  ROUND(SAFE_DIVIDE(
    (SELECT total_revenue FROM aov_oc1),
    (SELECT total_orders  FROM aov_oc1)
  ), 2)                                       AS avg_order_value,
  ROUND(SAFE_DIVIDE(
    (SELECT total_orders FROM aof),
    (SELECT n            FROM ntb)
  ), 2)                                       AS avg_order_frequency,
  ROUND(SAFE_DIVIDE(
    (SELECT total FROM ltv_90),
    (SELECT n     FROM ntb)
  ), 2)                                       AS realized_ltv_90d,
  ROUND(SAFE_DIVIDE(
    (SELECT cnt FROM repeat_30),
    (SELECT n   FROM ntb)
  ) * 100, 2)                                 AS repeat_rate_30d,
  (SELECT cnt FROM loyal)                     AS loyal_customers,
  (SELECT avg_cac FROM cac_data)              AS avg_cac,
  ROUND(SAFE_DIVIDE(
    (SELECT avg_cac FROM cac_data),
    SAFE_DIVIDE(
      SAFE_DIVIDE((SELECT total FROM ltv_90), (SELECT n FROM ntb)),
      90
    )
  ), 0)                                       AS cac_payback_days
FROM (SELECT 1)
"""
        rows   = self._run(sql, params)
        result = rows[0] if rows else {}
        self._set(ckey, result)
        return result

    def retention_windows(self, f: RetentionFilters) -> dict[str, Any]:
        ckey = f.cache_key("retention_windows")
        if hit := self._get(ckey):
            return hit

        where, params = self._base_params(f)

        sql = f"""
WITH cohort AS (
  SELECT phone_num
  FROM   {CUSTOMER_DIM}
  WHERE  {where}
),
ntb AS (SELECT COUNT(*) AS n FROM cohort),
all_orders AS (
  SELECT o.phone_num, o.days_since_first_order, o.order_seq
  FROM   {ORDER_FACT} o
  WHERE  o.phone_num IN (SELECT phone_num FROM cohort)
)
SELECT
  (SELECT n FROM ntb) AS ntb_count,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 7),   (SELECT n FROM ntb)), 2) AS freq_7d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 14),  (SELECT n FROM ntb)), 2) AS freq_14d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 30),  (SELECT n FROM ntb)), 2) AS freq_30d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 60),  (SELECT n FROM ntb)), 2) AS freq_60d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 90),  (SELECT n FROM ntb)), 2) AS freq_90d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 120), (SELECT n FROM ntb)), 2) AS freq_120d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 180), (SELECT n FROM ntb)), 2) AS freq_180d,
  ROUND(SAFE_DIVIDE(COUNTIF(days_since_first_order <= 360), (SELECT n FROM ntb)), 2) AS freq_360d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=7,   phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_7d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=14,  phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_14d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=30,  phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_30d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=60,  phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_60d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=90,  phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_90d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=120, phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_120d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=180, phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_180d,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(order_seq=2 AND days_since_first_order<=360, phone_num,NULL)),(SELECT n FROM ntb))*100,2) AS rate_360d
FROM all_orders
"""
        rows   = self._run(sql, params)
        result = rows[0] if rows else {}
        self._set(ckey, result)
        return result

    def cohort_heatmap(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key_by_end("cohort_heatmap")
        if hit := self._get(ckey):
            return hit

        heatmap_start = f.end_date.replace(year=f.end_date.year - 1)
        params: list = [
            bigquery.ScalarQueryParameter("hm_start", "DATE", heatmap_start),
            bigquery.ScalarQueryParameter("hm_end",   "DATE", f.end_date),
        ]

        sql = f"""
WITH cohort_customers AS (
  SELECT phone_num, cohort_month
  FROM   {CUSTOMER_DIM}
  WHERE  first_order_date BETWEEN @hm_start AND @hm_end
),
m0_sizes AS (
  SELECT cohort_month, COUNT(*) AS m0
  FROM   cohort_customers
  GROUP BY cohort_month
),
monthly_activity AS (
  SELECT
    o.cohort_month,
    o.months_since_first_order                     AS month_n,
    COUNT(DISTINCT o.phone_num)                    AS active_customers
  FROM   {ORDER_FACT} o
  WHERE  o.phone_num IN (SELECT phone_num FROM cohort_customers)
    AND  o.months_since_first_order BETWEEN 0 AND 8
  GROUP BY o.cohort_month, o.months_since_first_order
)
SELECT
  a.cohort_month,
  a.month_n,
  a.active_customers,
  m.m0                                                    AS m0_size,
  ROUND(SAFE_DIVIDE(a.active_customers, m.m0) * 100, 2)  AS retention_pct
FROM   monthly_activity a
JOIN   m0_sizes         m ON m.cohort_month = a.cohort_month
ORDER BY a.cohort_month, a.month_n
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def customer_composition(self, f: RetentionFilters) -> dict[str, Any]:
        ckey = f.cache_key("customer_composition")
        if hit := self._get(ckey):
            return hit

        where, params = self._base_params(f)

        sql = f"""
SELECT
  COUNT(*)                                                AS total_customers,
  COUNTIF(order_count_segment = '1_order')               AS oc_1,
  COUNTIF(order_count_segment = '2_orders')              AS oc_2,
  COUNTIF(order_count_segment = '3_orders')              AS oc_3,
  COUNTIF(order_count_segment = '3+_orders')             AS oc_3plus,
  COUNTIF(recency_segment = 'Active')                    AS rec_active,
  COUNTIF(recency_segment = 'Warm')                      AS rec_warm,
  COUNTIF(recency_segment = 'At-risk')                   AS rec_at_risk,
  COUNTIF(recency_segment = 'Lapsed')                    AS rec_lapsed,
  COUNTIF(ltv_bucket = '<500')                           AS ltv_lt500,
  COUNTIF(ltv_bucket = '500-700')                        AS ltv_500_700,
  COUNTIF(ltv_bucket = '700-1000')                       AS ltv_700_1000,
  COUNTIF(ltv_bucket = '1000-1500')                      AS ltv_1000_1500,
  COUNTIF(ltv_bucket = '1500+')                          AS ltv_1500plus,
  ROUND(AVG(lifetime_value), 2)                          AS avg_lifetime_value
FROM   {CUSTOMER_DIM}
WHERE  {where}
"""
        rows   = self._run(sql, params)
        result = rows[0] if rows else {}
        self._set(ckey, result)
        return result
