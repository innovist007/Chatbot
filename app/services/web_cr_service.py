"""Direct BigQuery queries for the Web CR dashboard.

Source: `innovist-master-data.analytics_432719895.data_table_session`

All metrics here mirror the DAX measures from the existing Power BI dashboard
so that numbers reconcile.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass
class WebCRFilters:
    start_date: date
    end_date: date
    channel_groups: list[str] | None = None
    devices: list[str] | None = None
    countries: list[str] | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "WebCRFilters":
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date - timedelta(days=n))


class WebCRService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        self.table = "`innovist-master-data.analytics_432719895.data_table_session`"

    # ------------------------------------------------------------------ helpers
    def _where(self, f: WebCRFilters) -> tuple[str, list]:
        clauses = ["date BETWEEN @start_date AND @end_date"]
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        if f.channel_groups:
            clauses.append("channel_group IN UNNEST(@channels)")
            params.append(bigquery.ArrayQueryParameter("channels", "STRING", f.channel_groups))
        if f.devices:
            clauses.append("device_category IN UNNEST(@devices)")
            params.append(bigquery.ArrayQueryParameter("devices", "STRING", f.devices))
        if f.countries:
            clauses.append("country IN UNNEST(@countries)")
            params.append(bigquery.ArrayQueryParameter("countries", "STRING", f.countries))
        return " AND ".join(clauses), params

    def _run(self, sql: str, params: list) -> list[dict[str, Any]]:
        cfg = bigquery.QueryJobConfig(query_parameters=params)
        rows = self.client.query(sql, job_config=cfg).result()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            for k, v in d.items():
                if isinstance(v, (date, datetime)):
                    d[k] = v.isoformat()
            out.append(d)
        return out

    # -------------------------------------------------------- core aggregates
    def _aggregates(self, f: WebCRFilters) -> dict[str, float]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(view_cart) AS view_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info) AS add_payment_info,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            COUNT(DISTINCT date) AS days
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        return {k: (v or 0) for k, v in (rows[0] if rows else {}).items()}

    @staticmethod
    def _derive(a: dict[str, float]) -> dict[str, float]:
        sessions = a.get("sessions") or 0
        purchases = a.get("purchases") or 0
        revenue = a.get("revenue") or 0
        atc = a.get("add_to_cart") or 0
        vc = a.get("view_cart") or 0
        bc = a.get("begin_checkout") or 0
        sh = a.get("add_shipping_info") or 0
        py = a.get("add_payment_info") or 0
        days = a.get("days") or 1

        out = dict(a)
        out["cr"] = (purchases / sessions) if sessions else 0
        out["aov"] = (revenue / purchases) if purchases else 0
        out["revenue_per_session"] = (revenue / sessions) if sessions else 0
        out["atc_rate"] = (atc / sessions) if sessions else 0
        out["view_cart_rate"] = (vc / atc) if atc else 0
        out["begin_checkout_rate"] = (bc / vc) if vc else 0
        out["shipping_info_rate"] = (sh / bc) if bc else 0
        out["payment_info_rate"] = (py / sh) if sh else 0
        out["purchase_rate"] = (purchases / py) if py else 0
        out["checkout_cr"] = (purchases / bc) if bc else 0
        out["daily_avg_sessions"] = sessions / days
        out["daily_avg_purchases"] = purchases / days
        out["daily_avg_revenue"] = revenue / days
        return out

    @staticmethod
    def _delta(curr: dict, prev: dict) -> dict:
        keys = [
            "sessions", "purchases", "revenue", "cr", "aov",
            "revenue_per_session", "atc_rate", "checkout_cr",
            "daily_avg_sessions", "daily_avg_purchases", "daily_avg_revenue",
        ]
        out = {}
        for k in keys:
            c = curr.get(k) or 0
            p = prev.get(k) or 0
            out[k] = ((c - p) / p) if p else None
        return out

    # ===================================================================== KPIs
    def overview(self, f: WebCRFilters) -> dict[str, Any]:
        curr = self._derive(self._aggregates(f))
        prev = self._derive(self._aggregates(f.previous_period()))
        return {
            "current": curr,
            "previous": prev,
            "deltas": self._delta(curr, prev),
            "compare_label": f"vs prev. {f.length_days}d",
        }

    # ================================================================== Funnel
    def funnel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """8-step funnel with drop %, step conversion, and overall conversion."""
        a = self._aggregates(f)

        # Steps in order. `count` is absolute. We compute % vs prior step (drop)
        # and % vs sessions (overall).
        sessions = a.get("sessions") or 0
        steps = [
            ("Sessions",        a.get("sessions"),         None),
            ("Add to cart",     a.get("add_to_cart"),      "sessions"),
            ("View cart",       a.get("view_cart"),        "add_to_cart"),
            ("Begin checkout",  a.get("begin_checkout"),   "view_cart"),
            ("Shipping info",   a.get("add_shipping_info"),"begin_checkout"),
            ("Payment info",    a.get("add_payment_info"), "add_shipping_info"),
            ("Purchase",        a.get("purchases"),        "add_payment_info"),
        ]

        out: list[dict[str, Any]] = []
        prev_count: float | None = None
        for label, cnt, _ in steps:
            cnt_f = cnt or 0
            step_conv = (cnt_f / prev_count) if prev_count else 1.0
            drop_pct = (1 - step_conv) if prev_count else 0
            overall = (cnt_f / sessions) if sessions else 0
            out.append({
                "step": label,
                "count": cnt_f,
                "step_conversion": step_conv,   # vs previous step
                "drop": drop_pct,                # 1 - step_conversion
                "overall_pct": overall,          # vs sessions
            })
            prev_count = cnt_f
        return out

    # ============================================================== by source
    def by_source(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS source,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY source
        ORDER BY sessions DESC
        LIMIT 20
        """
        return self._run(sql, params)

    # ============================================================== by device
    def by_device(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(device_category, '(unknown)') AS device,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY device
        ORDER BY sessions DESC
        """
        return self._run(sql, params)

    # ============================================================ by country
    def by_country(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(country, '(unknown)') AS country,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(sessions)) AS revenue_per_session
        FROM {self.table}
        WHERE {where}
        GROUP BY country
        ORDER BY sessions DESC
        LIMIT 10
        """
        return self._run(sql, params)

    # ======================================================= top landing pages
    def landing_pages(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SAFE_DIVIDE(SUM(revenue), SUM(purchases)) AS aov
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        ORDER BY sessions DESC
        LIMIT 15
        """
        return self._run(sql, params)

    # ============================================================== by hour
    def by_hour(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            CAST(hour AS INT64) AS hour,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where} AND hour IS NOT NULL
        GROUP BY hour
        ORDER BY hour
        """
        return self._run(sql, params)

    # ============================================================ daily trend
    def cr_trend(self, f: WebCRFilters) -> list[dict[str, Any]]:
        where, params = self._where(f)
        sql = f"""
        SELECT
            date,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SUM(revenue) AS revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        return self._run(sql, params)

    # ========================================================= filter options
    def filter_options(self) -> dict[str, list[str]]:
        cols = {"channels": "channel_group", "devices": "device_category", "countries": "country"}
        out: dict[str, list[str]] = {}
        for key, col in cols.items():
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
                logger.warning("web-cr filter %s failed: %s", col, e)
                out[key] = []
        return out