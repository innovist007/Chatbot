from __future__ import annotations

from typing import Any

from google.cloud import bigquery

from app.modules.retention.base import COHORT_CAC, CUSTOMER_DIM, ORDER_FACT, RetentionBase
from app.modules.retention.filters import RetentionFilters


class UnitEconomicsService(RetentionBase):

    def pnl_trend(self, f: RetentionFilters, granularity: str = "month") -> list[dict[str, Any]]:
        trunc_map = {"day": "DAY", "week": "WEEK(MONDAY)", "month": "MONTH"}
        trunc = trunc_map.get(granularity, "MONTH")
        ckey  = f.cache_key(f"pnl_trend_{granularity}")
        if hit := self._get(ckey):
            return hit

        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]

        sql = f"""
SELECT
  CAST(DATE_TRUNC(order_date, {trunc}) AS STRING)              AS period,
  COALESCE(NULLIF(TRIM(primary_brand),   ''), 'Unknown')       AS brand,
  COALESCE(NULLIF(TRIM(platform_type),   ''), 'Unknown')       AS platform,
  CASE WHEN order_seq = 1 THEN 'New' ELSE 'Repeat' END         AS customer_type,
  COUNT(DISTINCT order_id)                                      AS orders,
  COUNT(DISTINCT phone_num)                                     AS customers,
  ROUND(SUM(order_value), 2)                                    AS revenue,
  ROUND(SUM(COALESCE(discount_amount, 0)), 2)                   AS discount
FROM {ORDER_FACT}
WHERE order_date BETWEEN @start_date AND @end_date
GROUP BY period, brand, platform, customer_type
ORDER BY period ASC, brand, platform, customer_type
"""
        result = self._run(sql, params)
        self._set(ckey, result)
        return result

    def contribution_margin(self, f: RetentionFilters) -> dict[str, Any]:
        ckey = f.cache_key("contribution_margin")
        if hit := self._get(ckey):
            return hit

        where_cd, params = self._base_params_aliased(f, "cd")
        params += self._cohort_cac_params(f)

        sql = f"""
WITH cohort AS (
  SELECT phone_num FROM {CUSTOMER_DIM} cd WHERE {where_cd}
),
ntb AS (SELECT COUNT(*) AS n FROM cohort),
ltv_metrics AS (
  SELECT
    ROUND(SAFE_DIVIDE(SUM(o.order_value), (SELECT n FROM ntb)), 2)       AS gross_ltv_per_customer,
    ROUND(SAFE_DIVIDE(SUM(o.discount_amount), (SELECT n FROM ntb)), 2)   AS avg_discount_per_customer,
    ROUND(SAFE_DIVIDE(
      SUM(IF(o.shipment_status IN ('returned','refunded','RTO'), o.order_value, 0)),
      (SELECT n FROM ntb)), 2)                                            AS avg_returns_per_customer,
    ROUND(SAFE_DIVIDE(
      COUNT(DISTINCT IF(o.shipment_status IN ('returned','refunded','RTO'), o.order_id, NULL)),
      COUNT(DISTINCT o.order_id)) * 100, 2)                              AS return_rate_pct
  FROM {ORDER_FACT} o
  WHERE o.phone_num IN (SELECT phone_num FROM cohort)
),
cac_data AS (
  SELECT ROUND(AVG(cac), 2) AS avg_cac
  FROM {COHORT_CAC}
  WHERE cohort_month BETWEEN @cohort_start AND @cohort_end
)
SELECT
  (SELECT n FROM ntb)                                     AS ntb_customers,
  lm.gross_ltv_per_customer,
  lm.avg_discount_per_customer,
  lm.avg_returns_per_customer,
  lm.return_rate_pct,
  (SELECT avg_cac FROM cac_data)                          AS avg_cac,
  ROUND(lm.gross_ltv_per_customer - lm.avg_returns_per_customer, 2)
                                                          AS net_ltv_per_customer,
  ROUND(SAFE_DIVIDE(
    lm.gross_ltv_per_customer - lm.avg_returns_per_customer - (SELECT avg_cac FROM cac_data),
    lm.gross_ltv_per_customer) * 100, 2)                  AS contribution_margin_pct
FROM ltv_metrics lm
"""
        rows   = self._run(sql, params)
        result = rows[0] if rows else {}
        self._set(ckey, result)
        return result
