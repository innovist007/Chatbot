"""Direct BigQuery queries for dashboards (no LLM in the loop)."""
from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class DashboardFilters:
    start_date: date
    end_date: date
    platform_types: list[str] | None = None
    statuses: list[str] | None = None
    payment_modes: list[str] | None = None
    timeframe: str = "day"

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "DashboardFilters":
        n = self.length_days
        return replace(
            self,
            start_date=self.start_date - timedelta(days=n),
            end_date=self.end_date - timedelta(days=n),
        )

    def trunc_expr(self, col: str = "created_date_in_timezone") -> str:
        unit = {"day":"DAY","week":"WEEK","month":"MONTH","quarter":"QUARTER","year":"YEAR"}.get(
            (self.timeframe or "day").lower(), "DAY"
        )
        return f"DATE_TRUNC({col}, {unit})"


class DashboardService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        self.table = "`innovist-master-data.shopify.v_order_table`"

    # --------------------------------------------------------------- helpers
    def _where_clause(self, f: DashboardFilters) -> tuple[str, list]:
        clauses = ["created_date_in_timezone BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.platform_types:
            clauses.append("Platform_type IN UNNEST(@platform_types)")
            params.append(bigquery.ArrayQueryParameter("platform_types", "STRING", f.platform_types))
        if f.statuses:
            clauses.append("shipment_status IN UNNEST(@statuses)")
            params.append(bigquery.ArrayQueryParameter("statuses", "STRING", f.statuses))
        if f.payment_modes:
            clauses.append("Modes_of_payments IN UNNEST(@payment_modes)")
            params.append(bigquery.ArrayQueryParameter("payment_modes", "STRING", f.payment_modes))
        return " AND ".join(clauses), params

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(sql, job_config=job_config).result()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    # --------------------------------------------------------- raw KPI block
    def _raw_kpis(self, f: DashboardFilters) -> dict[str, float]:
        where, params = self._where_clause(f)
        sql = f"""
        SELECT
            COUNT(name) AS total_orders,
            SUM(total_price) AS gross_revenue,
            SUM(total_price) / 1.18 AS net_revenue,
            SUM(total_discounts) AS total_discounts,
            COUNTIF(shipment_status = 'Cancelled') AS cancelled_orders,
            COUNTIF(shipment_status = 'RTO') AS rto_orders,
            COUNT(DISTINCT customer_id) AS customer_count,
            SUM(IF(shipment_status = 'Cancelled', total_price, 0)) / 1.18 AS cancelled_revenue,
            SUM(IF(shipment_status = 'RTO', total_price, 0)) / 1.18 AS rto_revenue
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        return {k: (v or 0) for k, v in (rows[0] if rows else {}).items()}

    @staticmethod
    def _derive(raw: dict[str, float]) -> dict[str, float]:
        total = raw.get("total_orders") or 0
        cancelled = raw.get("cancelled_orders") or 0
        rto = raw.get("rto_orders") or 0
        net_rev = raw.get("net_revenue") or 0
        gross = raw.get("gross_revenue") or 0
        disc = raw.get("total_discounts") or 0
        out = dict(raw)
        out["aov"] = (net_rev / total) if total else 0
        out["pct_cancelled"] = (cancelled / total) if total else 0
        denom_rto = (total - cancelled) or 1
        out["pct_return"] = (rto / denom_rto) if denom_rto else 0
        out["pct_discount"] = (disc / (disc + gross)) if (disc + gross) else 0
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = ["net_revenue", "total_orders", "aov", "pct_discount", "pct_cancelled", "pct_return", "customer_count"]
        deltas = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            if p == 0:
                deltas[k] = None    # can't divide
            else:
                deltas[k] = (c - p) / p
        return deltas

    def kpis(self, f: DashboardFilters) -> dict[str, Any]:
        curr = self._derive(self._raw_kpis(f))
        prev = self._derive(self._raw_kpis(f.previous_period()))
        return {
            "current": curr,
            "previous": prev,
            "deltas": self._delta(curr, prev),
            "compare_label": f"vs prev. {f.length_days}d",
        }

    # ------------------------------------------------- revenue leak waterfall
    def revenue_waterfall(self, f: DashboardFilters) -> list[dict[str, Any]]:
        """Stages from gross revenue down to net delivered revenue."""
        raw = self._raw_kpis(f)
        gross = raw.get("gross_revenue") or 0
        gross_net = gross / 1.18                     # ex-GST gross
        discounts = raw.get("total_discounts") or 0
        cancelled = raw.get("cancelled_revenue") or 0
        rto = raw.get("rto_revenue") or 0
        delivered = gross_net - cancelled - rto

        # Build waterfall stages with running totals
        return [
            {"stage": "Gross Revenue", "value": gross_net, "type": "start"},
            {"stage": "− Cancelled",    "value": -cancelled, "type": "negative"},
            {"stage": "− RTO Returns",  "value": -rto, "type": "negative"},
            {"stage": "Net Delivered",  "value": delivered, "type": "total"},
        ]

    # ------------------------------------------------------------- time series
    def revenue_series(self, f: DashboardFilters) -> list[dict[str, Any]]:
        where, params = self._where_clause(f)
        bucket = f.trunc_expr()
        sql = f"""
        SELECT
            {bucket} AS bucket,
            SUM(total_price) / 1.18 AS net_revenue,
            COUNT(name) AS order_count,
            SUM(IF(shipment_status = 'Cancelled', total_price, 0)) / 1.18 AS cancelled_revenue,
            SUM(IF(shipment_status = 'RTO', total_price, 0)) / 1.18 AS rto_revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY bucket
        ORDER BY bucket
        """
        return self._run(sql, params)

    # ------------------------------------------------------------------ splits
    def revenue_split(self, f: DashboardFilters, dimension: str) -> list[dict[str, Any]]:
        allowed = {"Platform_type", "Modes_of_payments", "cust_type", "Name_of_Channel",
                   "gender", "shipment_status", "day_type", "Platform"}
        if dimension not in allowed:
            raise ValueError(f"Unsupported dimension: {dimension}")

        where, params = self._where_clause(f)
        sql = f"""
        SELECT
            COALESCE(CAST({dimension} AS STRING), '(Blank)') AS label,
            SUM(total_price) / 1.18 AS net_revenue,
            COUNT(name) AS order_count
        FROM {self.table}
        WHERE {where}
        GROUP BY label
        ORDER BY net_revenue DESC
        LIMIT 10
        """
        return self._run(sql, params)

    # ------------------------------------------------------- top products view
    def top_dimensions(self, f: DashboardFilters) -> list[dict[str, Any]]:
        """Biggest revenue contributors across platform × payment mode."""
        where, params = self._where_clause(f)
        sql = f"""
        SELECT
            COALESCE(Platform_type, '(unknown)') AS platform,
            COALESCE(Modes_of_payments, '(unknown)') AS payment_mode,
            SUM(total_price) / 1.18 AS net_revenue,
            COUNT(name) AS order_count,
            COUNTIF(shipment_status = 'Cancelled') AS cancelled,
            COUNTIF(shipment_status = 'RTO') AS rto
        FROM {self.table}
        WHERE {where}
        GROUP BY platform, payment_mode
        ORDER BY net_revenue DESC
        LIMIT 8
        """
        return self._run(sql, params)

    # --------------------------------------------------------- filter options
    def filter_options(self) -> dict[str, list[str]]:
        columns = {
            "platforms":     "Platform_type",
            "statuses":      "shipment_status",
            "payment_modes": "Modes_of_payments",
        }
        out: dict[str, list[str]] = {}
        for key, col in columns.items():
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
                logger.warning("filter_options column %s failed: %s", col, e)
                out[key] = []
        return out