from __future__ import annotations

from typing import Any

from google.cloud import bigquery

from app.modules.retention.base import (
    CHANNEL_CAC, COHORT_CAC, CUSTOMER_DIM, ORDER_FACT, RetentionBase,
)
from app.modules.retention.filters import RetentionFilters, WINDOW_DAYS


class AcquisitionQualityService(RetentionBase):

    def channel_quality(self, f: RetentionFilters, window: str = "30d") -> list[dict[str, Any]]:
        win_days = WINDOW_DAYS.get(window, 30)
        ckey = f.cache_key(f"channel_quality:{window}")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params += self._cohort_cac_params(f)
        params.append(bigquery.ScalarQueryParameter("win_days", "INT64", win_days))

        sql = f"""
WITH channel_metrics AS (
  SELECT
    cd.acquisition_channel                                AS channel,
    COUNT(DISTINCT cd.phone_num)                          AS ntb_count,
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=@win_days, o.phone_num, NULL))
                                                          AS retained,
    ROUND(SAFE_DIVIDE(
      COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=@win_days, o.phone_num, NULL)),
      COUNT(DISTINCT cd.phone_num)) * 100, 2)             AS retention_rate,
    ROUND(SAFE_DIVIDE(
      SUM(IF(o.days_since_first_order<=90, o.order_value, 0)),
      COUNT(DISTINCT cd.phone_num)), 2)                   AS ltv_90d
  FROM   {CUSTOMER_DIM} cd
  LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
  WHERE  {where_cd}
    AND  cd.acquisition_channel IS NOT NULL
    AND  TRIM(cd.acquisition_channel) != ''
  GROUP BY cd.acquisition_channel
),
cac_lookup AS (
  SELECT channel, ROUND(AVG(cac), 2) AS avg_cac
  FROM   {CHANNEL_CAC}
  WHERE  cohort_month BETWEEN @cohort_start AND @cohort_end
  GROUP BY channel
)
SELECT
  cm.channel,
  cm.ntb_count,
  cm.retained,
  cm.retention_rate,
  cm.ltv_90d,
  cl.avg_cac,
  ROUND(SAFE_DIVIDE(cm.ltv_90d, cl.avg_cac), 2)          AS ltv_cac_ratio,
  ROUND(SAFE_DIVIDE(cl.avg_cac, SAFE_DIVIDE(cm.ltv_90d, 90)), 0)
                                                          AS payback_days
FROM   channel_metrics cm
LEFT JOIN cac_lookup cl ON cl.channel = cm.channel
ORDER BY cm.ntb_count DESC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def discount_repeat(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key_by_end("discount_repeat")
        if hit := self._get(ckey):
            return hit

        heatmap_start = f.end_date.replace(year=f.end_date.year - 1)
        params = [
            bigquery.ScalarQueryParameter("hm_start", "DATE", heatmap_start),
            bigquery.ScalarQueryParameter("hm_end",   "DATE", f.end_date),
        ]

        sql = f"""
SELECT
  cd.cohort_month,
  CASE
    WHEN cd.acquisition_discount_segment IS NULL
      OR TRIM(cd.acquisition_discount_segment) = ''
    THEN 'full_price'
    ELSE 'discount_acquired'
  END                                                     AS discount_segment,
  COUNT(DISTINCT cd.phone_num)                            AS ntb_count,
  COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL))
                                                          AS retained_30d,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL)),
    COUNT(DISTINCT cd.phone_num)) * 100, 2)               AS retention_rate_30d,
  ROUND(SAFE_DIVIDE(
    SUM(IF(o.days_since_first_order<=90, o.order_value, 0)),
    COUNT(DISTINCT cd.phone_num)), 2)                     AS ltv_90d
FROM   {CUSTOMER_DIM} cd
LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
WHERE  cd.first_order_date BETWEEN @hm_start AND @hm_end
GROUP BY cd.cohort_month, discount_segment
ORDER BY cd.cohort_month, discount_segment
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def payment_split(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key_by_end("payment_split")
        if hit := self._get(ckey):
            return hit

        heatmap_start = f.end_date.replace(year=f.end_date.year - 1)
        params = [
            bigquery.ScalarQueryParameter("hm_start", "DATE", heatmap_start),
            bigquery.ScalarQueryParameter("hm_end",   "DATE", f.end_date),
        ]

        sql = f"""
SELECT
  cd.cohort_month,
  cd.acquisition_payment_mode                             AS payment_mode,
  COUNT(DISTINCT cd.phone_num)                            AS ntb_count,
  COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL))
                                                          AS retained_30d,
  ROUND(SAFE_DIVIDE(
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL)),
    COUNT(DISTINCT cd.phone_num)) * 100, 2)               AS retention_rate_30d,
  ROUND(SAFE_DIVIDE(
    SUM(IF(o.days_since_first_order<=90, o.order_value, 0)),
    COUNT(DISTINCT cd.phone_num)), 2)                     AS ltv_90d
FROM   {CUSTOMER_DIM} cd
LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
WHERE  cd.first_order_date BETWEEN @hm_start AND @hm_end
  AND  cd.acquisition_payment_mode IS NOT NULL
  AND  TRIM(cd.acquisition_payment_mode) != ''
GROUP BY cd.cohort_month, cd.acquisition_payment_mode
ORDER BY cd.cohort_month, cd.acquisition_payment_mode
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def city_tier(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("city_tier")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params += self._cohort_cac_params(f)

        sql = f"""
WITH tier_metrics AS (
  SELECT
    cd.acquisition_city_tier                              AS city_tier,
    COUNT(DISTINCT cd.phone_num)                          AS ntb_count,
    COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL))
                                                          AS retained_30d,
    ROUND(SAFE_DIVIDE(
      COUNT(DISTINCT IF(o.order_seq=2 AND o.days_since_first_order<=30, o.phone_num, NULL)),
      COUNT(DISTINCT cd.phone_num)) * 100, 2)             AS retention_rate_30d,
    ROUND(SAFE_DIVIDE(
      SUM(IF(o.days_since_first_order<=90, o.order_value, 0)),
      COUNT(DISTINCT cd.phone_num)), 2)                   AS ltv_90d
  FROM   {CUSTOMER_DIM} cd
  LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
  WHERE  {where_cd}
  GROUP BY cd.acquisition_city_tier
),
avg_cac AS (
  SELECT AVG(cac) AS cac
  FROM   {COHORT_CAC}
  WHERE  cohort_month BETWEEN @cohort_start AND @cohort_end
)
SELECT
  tm.city_tier,
  tm.ntb_count,
  tm.retained_30d,
  tm.retention_rate_30d,
  tm.ltv_90d,
  (SELECT cac FROM avg_cac)                               AS avg_cac,
  ROUND(SAFE_DIVIDE(tm.ltv_90d, (SELECT cac FROM avg_cac)), 2)
                                                          AS ltv_cac_ratio
FROM   tier_metrics tm
ORDER BY tm.ntb_count DESC
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def aov_by_order(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("aov_by_order")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")

        sql = f"""
SELECT
  o.primary_brand                                         AS brand,
  CASE
    WHEN o.order_seq = 1 THEN 'OC1'
    WHEN o.order_seq = 2 THEN 'OC2'
    WHEN o.order_seq = 3 THEN 'OC3'
    ELSE 'OC3+'
  END                                                     AS order_cohort,
  MIN(o.order_seq)                                        AS min_seq,
  COUNT(*)                                                AS order_count,
  ROUND(AVG(o.order_value), 2)                            AS avg_order_value
FROM   {ORDER_FACT} o
JOIN   {CUSTOMER_DIM} cd ON cd.phone_num = o.phone_num
WHERE  {where_cd}
  AND  o.primary_brand IN ('Bare Anatomy', 'Chemist at Play', 'Sunscoop')
GROUP BY o.primary_brand, order_cohort
HAVING COUNT(*) >= 20
ORDER BY o.primary_brand, min_seq
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result
