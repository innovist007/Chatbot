from __future__ import annotations

from typing import Any

from google.cloud import bigquery

from app.modules.retention.base import (
    CHANNEL_CAC, COHORT_CAC, CUSTOMER_DIM, ORDER_FACT, RetentionBase,
)
from app.modules.retention.filters import GRAIN_TRUNC, RetentionFilters, SEGMENT_COL, WINDOW_DAYS


class TrendService(RetentionBase):

    def retention_trend(
        self, f: RetentionFilters, segment: str = "brand",
        window: str = "30d", granularity: str = "WoW",
    ) -> list[dict[str, Any]]:
        seg_col  = SEGMENT_COL.get(segment, "acquisition_brand")
        win_days = WINDOW_DAYS.get(window, 30)
        grain    = GRAIN_TRUNC.get(granularity, "WEEK(MONDAY)")

        ckey = f.cache_key(f"ret_trend:{segment}:{window}:{granularity}")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params.append(bigquery.ScalarQueryParameter("win_days", "INT64", win_days))

        # `week_start` is kept as the field name for frontend compatibility; it
        # now holds the cohort bucket truncated to the requested granularity.
        sql = f"""
SELECT
  DATE_TRUNC(cd.first_order_date, {grain})              AS week_start,
  cd.{seg_col}                                            AS segment_value,
  COUNT(DISTINCT cd.phone_num)                            AS ntb_count,
  COUNT(DISTINCT IF(
    o.order_seq = 2 AND o.days_since_first_order <= @win_days,
    o.phone_num, NULL))                                   AS retained,
  ROUND(SAFE_DIVIDE(COUNT(DISTINCT IF(
    o.order_seq = 2 AND o.days_since_first_order <= @win_days,
    o.phone_num, NULL)), COUNT(DISTINCT cd.phone_num)) * 100, 2)
                                                          AS retention_rate,
  ROUND(SAFE_DIVIDE(
    SUM(IF(o.days_since_first_order <= @win_days, o.order_value, 0)),
    COUNT(DISTINCT cd.phone_num)), 2)                     AS ltv,
  ROUND(AVG(IF(o.days_since_first_order <= @win_days, o.order_value, NULL)), 2)
                                                          AS aov,
  ROUND(SAFE_DIVIDE(
    COUNTIF(o.days_since_first_order <= @win_days),
    COUNT(DISTINCT cd.phone_num)), 2)                     AS avg_freq
FROM   {CUSTOMER_DIM} cd
LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
WHERE  {where_cd}
GROUP BY week_start, segment_value
ORDER BY week_start, segment_value
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def ltv_cac_trend(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key_by_end("ltv_cac_trend")
        if hit := self._get(ckey):
            return hit

        heatmap_start = f.end_date.replace(year=f.end_date.year - 1)
        params = [
            bigquery.ScalarQueryParameter("cohort_start", "STRING", heatmap_start.strftime("%Y-%m")),
            bigquery.ScalarQueryParameter("cohort_end",   "STRING", f.cohort_end),
        ]

        sql = f"""
WITH cohort_ltv AS (
  SELECT
    cd.cohort_month,
    COUNT(DISTINCT cd.phone_num)                           AS ntb_count,
    ROUND(SAFE_DIVIDE(
      SUM(IF(o.days_since_first_order <= 90, o.order_value, 0)),
      COUNT(DISTINCT cd.phone_num)), 2)                    AS ltv_90d,
    ROUND(SAFE_DIVIDE(
      SUM(IF(o.order_seq = 1, o.order_value, 0)),
      COUNTIF(o.order_seq = 1)), 2)                        AS avg_aov
  FROM   {CUSTOMER_DIM} cd
  LEFT JOIN {ORDER_FACT} o ON o.phone_num = cd.phone_num
  WHERE  cd.cohort_month BETWEEN @cohort_start AND @cohort_end
  GROUP BY cd.cohort_month
)
SELECT
  cc.cohort_month,
  cl.ntb_count,
  cl.ltv_90d,
  cl.avg_aov,
  cc.cac,
  ROUND(SAFE_DIVIDE(cl.ltv_90d, cc.cac), 2)               AS ltv_cac_ratio,
  ROUND(SAFE_DIVIDE(cc.cac, SAFE_DIVIDE(cl.ltv_90d, 90)), 0) AS payback_days
FROM   {COHORT_CAC} cc
LEFT JOIN cohort_ltv cl ON cl.cohort_month = cc.cohort_month
WHERE  cc.cohort_month BETWEEN @cohort_start AND @cohort_end
ORDER BY cc.cohort_month
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def brand_mix(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("brand_mix")
        if hit := self._get(ckey):
            return hit

        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]

        sql = f"""
SELECT
  o.order_month,
  o.primary_brand                                         AS brand,
  o.prev_brand,
  CASE
    WHEN o.order_seq = 1              THEN 'NTB'
    WHEN o.prev_brand = o.primary_brand THEN 'existing'
    ELSE 'cross'
  END                                                     AS buyer_type,
  COUNT(DISTINCT o.phone_num)                             AS customer_count,
  ROUND(SUM(o.order_value), 2)                            AS revenue
FROM   {ORDER_FACT} o
WHERE  o.order_date BETWEEN @start_date AND @end_date
  AND  o.primary_brand IS NOT NULL
GROUP BY o.order_month, o.primary_brand, o.prev_brand, buyer_type
ORDER BY o.order_month, o.primary_brand, buyer_type
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def brand_overlap(self, f: RetentionFilters) -> list[dict[str, Any]]:
        ckey = f.cache_key("brand_overlap")
        if hit := self._get(ckey):
            return hit

        where, params = self._base_params(f)

        sql = f"""
SELECT
  order_count_segment,
  COUNT(*)                                                                              AS total,
  COUNTIF(ever_bought_ba=1 AND ever_bought_cap=0 AND ever_bought_ss=0)                AS ba_only,
  COUNTIF(ever_bought_ba=0 AND ever_bought_cap=1 AND ever_bought_ss=0)                AS cap_only,
  COUNTIF(ever_bought_ba=0 AND ever_bought_cap=0 AND ever_bought_ss=1)                AS ss_only,
  COUNTIF(ever_bought_ba=1 AND ever_bought_cap=1 AND ever_bought_ss=0)                AS ba_cap,
  COUNTIF(ever_bought_ba=0 AND ever_bought_cap=1 AND ever_bought_ss=1)                AS cap_ss,
  COUNTIF(ever_bought_ba=1 AND ever_bought_cap=0 AND ever_bought_ss=1)                AS ba_ss,
  COUNTIF(ever_bought_ba=1 AND ever_bought_cap=1 AND ever_bought_ss=1)                AS all_three
FROM   {CUSTOMER_DIM}
WHERE  {where}
GROUP BY order_count_segment
ORDER BY order_count_segment
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result
