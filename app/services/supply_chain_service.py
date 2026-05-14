"""Supply chain service — fulfilment analytics (RTO, NDR, TAT, courier, warehouse)."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

import redis
from google.cloud import bigquery

from app.config import Settings

logger = logging.getLogger(__name__)

TABLE = "`innovist-master-data.shopify.rto_analytics`"

# Status buckets agreed with product
RTO_STATUSES = ("RTO", "RTO-Failed", "RTO-ShipmentDelay")
DELIVERED_STATUS = "Delivered"
CANCELLED_STATUS = "Cancelled"
INTRANSIT_STATUS = "Intransit"
OTHERS_STATUSES = (
    "Damaged", "Lost", "ShipmentHeld","NoStatusExist",
    "NotServiceable", "PickupFailed", "Expired", "Awb Registered",
)

ETA_DAY_LABELS = ("D0", "D1", "D2", "D3")
STUCK_AGE_DAYS = 7

SEGMENT_COLUMNS = {
    "warehouse": "Pickup_Warehouse",
    "courier": "courier_partner",
    "payment": "payment_mode",
    "daytype": "day_type",
}


@dataclass
class SupplyChainFilters:
    """Filters applied to every supply chain query."""
    start_date: date
    end_date: date
    compare_mode: str = "MoM"

    def cache_key(self, prefix: str) -> str:
        return ":".join([
            prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.compare_mode,
        ])


def previous_period(start: date, end: date, mode: str = "MoM") -> tuple[date, date]:
    days = (end - start).days
    if mode == "DoD":
        return (start - timedelta(days=days + 1), start - timedelta(days=1))
    if mode == "WoW":
        return (start - timedelta(days=7), end - timedelta(days=7))
    if mode == "MoM":
        return (start - timedelta(days=30), end - timedelta(days=30))
    if mode == "YoY":
        return (start - timedelta(days=365), end - timedelta(days=365))
    return (start - timedelta(days=days + 1), start - timedelta(days=1))


def _sql_in(values: tuple[str, ...]) -> str:
    return "(" + ", ".join(f"'{v}'" for v in values) + ")"


class SupplyChainService:
    """Reads supply chain KPIs from BigQuery, caches via Redis."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)
        self.table = TABLE
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
            logger.info("Supply chain: Redis cache connected")
        except Exception as e:
            logger.warning(f"Supply chain: Redis unavailable: {e}")
            self.redis_client = None
            self.cache_enabled = False

    # ---------- cache helpers ----------
    def _get_cache(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            raw = self.redis_client.get(key)
            return json.loads(raw) if raw else None
        except Exception as e:
            logger.error(f"Cache get error: {e}")
            return None

    def _set_cache(self, key: str, value: Any, ttl: int = 3600) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
        except Exception as e:
            logger.error(f"Cache set error: {e}")

    def _run(self, sql: str, params: list) -> list[dict]:
        cfg = bigquery.QueryJobConfig(query_parameters=params) if params else None
        rows = self.client.query(sql, job_config=cfg).result()
        return [dict(r) for r in rows]

    def _where(self, f: SupplyChainFilters) -> tuple[str, list]:
        params: list = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date),
        ]
        return "created_date_in_timezone BETWEEN @start_date AND @end_date", params

    # ---------- overview KPIs ----------
    def overview(self, f: SupplyChainFilters) -> dict:
        cache_key = f.cache_key("sc_overview")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        curr = self._kpi_aggregates(f)
        prev_start, prev_end = previous_period(f.start_date, f.end_date, f.compare_mode)
        prev = self._kpi_aggregates(SupplyChainFilters(
            start_date=prev_start, end_date=prev_end,
            compare_mode=f.compare_mode,
        ))

        result = {
            "current": curr,
            "previous": prev,
            "deltas": self._deltas(curr, prev),
            "compare_label": f.compare_mode,
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    def _kpi_aggregates(self, f: SupplyChainFilters) -> dict:
        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        eta_in = _sql_in(ETA_DAY_LABELS)
        sql = f"""
        SELECT
          COUNT(name) AS total_orders,
          COUNTIF(shipment_status = '{DELIVERED_STATUS}') AS delivered_orders,
          COUNTIF(shipment_status IN {rto_in}) AS rto_orders,
          COUNTIF(shipment_status = '{CANCELLED_STATUS}') AS cancelled_orders,
          COUNTIF(shipment_status = '{INTRANSIT_STATUS}') AS intransit_orders,
          COUNTIF(shipment_status = '{INTRANSIT_STATUS}'
                  AND DATE_DIFF(CURRENT_DATE(), DATE(created_at), DAY) > {STUCK_AGE_DAYS}
          ) AS stuck_orders,
          COUNTIF(out_for_delivery_attempts > 1) AS ndr_orders,
          COUNTIF(delivered_day_label IN {eta_in}) AS in_eta_orders,
          COUNTIF(delivery_date IS NOT NULL
                  AND DATE(delivery_date) = DATE(out_for_delivery_1st_attempt)
          ) AS first_attempt_delivered_orders,
          SUM(IF(shipment_status = '{DELIVERED_STATUS}', total_price, 0)) AS delivered_revenue,
          AVG(TIMESTAMP_DIFF(created_at, TIMESTAMP(created_at_in_timezone), HOUR))
            AS order_to_dispatch_hours,
          AVG(TIMESTAMP_DIFF(pickup_date, TIMESTAMP(created_at_in_timezone), HOUR) / 24.0)
            AS dispatch_to_pickup_days,
          AVG(TIMESTAMP_DIFF(delivery_date, pickup_date, HOUR) / 24.0)
            AS pickup_to_delivery_days,
          AVG(IF(shipment_status IN {rto_in},
                  TIMESTAMP_DIFF(rto_mark_date, TIMESTAMP(created_at_in_timezone), HOUR) / 24.0, NULL)
          ) AS rto_tat_days
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        return self._derive_kpis(rows[0]) if rows else {}

    def _derive_kpis(self, agg: dict) -> dict:
        total = int(agg.get("total_orders") or 0)
        delivered = int(agg.get("delivered_orders") or 0)
        rto = int(agg.get("rto_orders") or 0)
        cancelled = int(agg.get("cancelled_orders") or 0)
        intransit = int(agg.get("intransit_orders") or 0)
        stuck = int(agg.get("stuck_orders") or 0)
        ndr = int(agg.get("ndr_orders") or 0)
        in_eta = int(agg.get("in_eta_orders") or 0)
        first_attempt = int(agg.get("first_attempt_delivered_orders") or 0)
        return {
            "total_orders": total,
            "delivered_orders": delivered,
            "delivered_pct": delivered / total if total else 0,
            "delivered_revenue": float(agg.get("delivered_revenue") or 0),
            "rto_orders": rto,
            "rto_pct": rto / total if total else 0,
            "cancelled_orders": cancelled,
            "cancelled_pct": cancelled / total if total else 0,
            "intransit_orders": intransit,
            "stuck_orders": stuck,
            "ndr_orders": ndr,
            "ndr_pct": ndr / total if total else 0,
            "in_eta_orders": in_eta,
            "in_eta_pct": in_eta / total if total else 0,
            "first_attempt_delivered_pct": first_attempt / total if total else 0,
            "order_to_dispatch_hours": float(agg.get("order_to_dispatch_hours") or 0),
            "dispatch_to_pickup_days": float(agg.get("dispatch_to_pickup_days") or 0),
            "pickup_to_delivery_days": float(agg.get("pickup_to_delivery_days") or 0),
            "rto_tat_days": float(agg.get("rto_tat_days") or 0),
        }

    def _deltas(self, curr: dict, prev: dict) -> dict:
        pct_point_keys = {
            "rto_pct", "delivered_pct", "cancelled_pct", "ndr_pct",
            "in_eta_pct", "first_attempt_delivered_pct",
        }
        out: dict[str, float] = {}
        for k, v in curr.items():
            if not isinstance(v, (int, float)):
                continue
            p = prev.get(k, 0)
            if k in pct_point_keys:
                out[k] = v - p
            elif p:
                out[k] = (v - p) / p
            else:
                out[k] = 0
        return out

    # ---------- order waterfall ----------
    def waterfall(self, f: SupplyChainFilters) -> dict:
        cache_key = f.cache_key("sc_waterfall")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        others_in = _sql_in(OTHERS_STATUSES)
        sql = f"""
        SELECT
          COUNT(name) AS total_orders,
          COUNTIF(shipment_status = '{CANCELLED_STATUS}') AS cancelled,
          COUNTIF(shipment_status IN {rto_in}) AS rto,
          COUNTIF(shipment_status IN {others_in}) AS others,
          COUNTIF(shipment_status = '{INTRANSIT_STATUS}') AS intransit,
          COUNTIF(shipment_status = '{DELIVERED_STATUS}') AS delivered,
          SUM(IF(shipment_status = '{CANCELLED_STATUS}', total_price, 0)) AS cancelled_revenue,
          SUM(IF(shipment_status IN {rto_in}, total_price, 0)) AS rto_revenue,
          SUM(IF(shipment_status = '{DELIVERED_STATUS}', total_price, 0)) AS delivered_revenue
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        if not rows:
            return {}
        r = rows[0]
        total = int(r.get("total_orders") or 0)

        def share(n: int) -> float:
            return (n / total) if total else 0

        steps = []
        for label, count_key, rev_key in [
            ("Cancelled", "cancelled", "cancelled_revenue"),
            ("RTO", "rto", "rto_revenue"),
            ("Others", "others", None),
            ("In-transit", "intransit", None),
            ("Delivered", "delivered", "delivered_revenue"),
        ]:
            n = int(r.get(count_key) or 0)
            steps.append({
                "label": label,
                "orders": n,
                "share": share(n),
                "revenue": float(r.get(rev_key) or 0) if rev_key else 0,
            })

        result = {"total_orders": total, "steps": steps}
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- NDR funnel ----------
    def ndr_funnel(self, f: SupplyChainFilters) -> dict:
        cache_key = f.cache_key("sc_ndr_funnel")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        sql = f"""
        SELECT
          COUNT(name) AS total_orders,
          COUNTIF(out_for_delivery_attempts > 1) AS ndr_raised,
          COUNTIF(out_for_delivery_attempts >= 2) AS reattempted,
          COUNTIF(out_for_delivery_attempts >= 2
                  AND shipment_status = '{DELIVERED_STATUS}') AS delivered_on_reattempt,
          COUNTIF(out_for_delivery_attempts > 1
                  AND shipment_status IN {rto_in}) AS ndr_to_rto,
          COUNTIF(shipment_status IN {rto_in}) AS rto_total
        FROM {self.table}
        WHERE {where}
        """
        rows = self._run(sql, params)
        if not rows:
            return {}
        r = rows[0]
        total = int(r.get("total_orders") or 0)
        ndr = int(r.get("ndr_raised") or 0)
        reatt = int(r.get("reattempted") or 0)
        delivered_reatt = int(r.get("delivered_on_reattempt") or 0)
        ndr_rto = int(r.get("ndr_to_rto") or 0)
        rto_total = int(r.get("rto_total") or 0)

        result = {
            "total_orders": total,
            "ndr_raised": ndr,
            "ndr_rate": ndr / total if total else 0,
            "reattempted": reatt,
            "reattempt_rate": reatt / ndr if ndr else 0,
            "delivered_on_reattempt": delivered_reatt,
            "reattempt_success_rate": delivered_reatt / reatt if reatt else 0,
            "ndr_to_rto": ndr_rto,
            "ndr_to_rto_rate": ndr_rto / ndr if ndr else 0,
            "rto_total": rto_total,
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- segment tables (warehouse / courier / payment) ----------
    def warehouse_table(self, f: SupplyChainFilters) -> list[dict]:
        return self._segment_table(f, "Pickup_Warehouse", "sc_warehouse_table")

    def courier_table(self, f: SupplyChainFilters) -> list[dict]:
        return self._segment_table(f, "courier_partner", "sc_courier_table")

    def payment_table(self, f: SupplyChainFilters) -> list[dict]:
        return self._segment_table(f, "payment_mode", "sc_payment_table")

    def _segment_table(
        self, f: SupplyChainFilters, segment_column: str, cache_prefix: str
    ) -> list[dict]:
        cache_key = f.cache_key(cache_prefix)
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        eta_in = _sql_in(ETA_DAY_LABELS)
        sql = f"""
        SELECT
          {segment_column} AS segment,
          COUNT(name) AS orders,
          COUNTIF(shipment_status = '{DELIVERED_STATUS}') AS delivered,
          COUNTIF(shipment_status IN {rto_in}) AS rto,
          COUNTIF(out_for_delivery_attempts > 1) AS ndr,
          COUNTIF(delivered_day_label IN {eta_in}) AS in_eta,
          COUNTIF(delivered_day_label = 'D1') AS first_attempt,
          AVG(TIMESTAMP_DIFF(created_at, TIMESTAMP(created_at_in_timezone), HOUR))
            AS ord_to_disp_hours,
          AVG(TIMESTAMP_DIFF(pickup_date, TIMESTAMP(created_at_in_timezone), HOUR) / 24.0)
            AS disp_to_pick_days,
          AVG(TIMESTAMP_DIFF(delivery_date, pickup_date, HOUR) / 24.0)
            AS pick_to_del_days,
          AVG(IF(shipment_status IN {rto_in},
              TIMESTAMP_DIFF(rto_mark_date, TIMESTAMP(created_at_in_timezone), HOUR) / 24.0, NULL)) AS rto_tat_days
        FROM {self.table}
        WHERE {where}
          AND {segment_column} IS NOT NULL
        GROUP BY segment
        ORDER BY orders DESC
        """
        rows = self._run(sql, params)

        # Previous period RTO% per segment (for MoM Δ)
        prev_start, prev_end = previous_period(f.start_date, f.end_date, f.compare_mode)
        prev_f = SupplyChainFilters(
            start_date=prev_start, end_date=prev_end, compare_mode=f.compare_mode,
        )
        prev_where, prev_params = self._where(prev_f)
        prev_sql = f"""
        SELECT
          {segment_column} AS segment,
          SAFE_DIVIDE(COUNTIF(shipment_status IN {rto_in}), COUNT(name)) AS rto_pct
        FROM {self.table}
        WHERE {prev_where}
          AND {segment_column} IS NOT NULL
        GROUP BY segment
        """
        prev_rows = self._run(prev_sql, prev_params)
        prev_rto = {r.get("segment"): float(r.get("rto_pct") or 0) for r in prev_rows}

        # Last 7 days daily RTO% per segment (for sparkline)
        trend_sql = f"""
        SELECT
          {segment_column} AS segment,
          created_date_in_timezone AS d,
          SAFE_DIVIDE(COUNTIF(shipment_status IN {rto_in}), COUNT(name)) AS rto_pct
        FROM {self.table}
        WHERE created_date_in_timezone BETWEEN
              DATE_SUB(@end_date, INTERVAL 6 DAY) AND @end_date
          AND {segment_column} IS NOT NULL
        GROUP BY segment, d
        ORDER BY segment, d
        """
        trend_rows = self._run(
            trend_sql,
            [bigquery.ScalarQueryParameter("end_date", "DATE", f.end_date)],
        )
        trend_map: dict[str, list[dict]] = {}
        for r in trend_rows:
            trend_map.setdefault(r.get("segment"), []).append({
                "d": str(r.get("d")),
                "rto_pct": float(r.get("rto_pct") or 0),
            })

        result = []
        for row in rows:
            o = int(row.get("orders") or 0)
            seg = row.get("segment")
            curr_rto = (int(row.get("rto") or 0) / o) if o else 0
            result.append({
                "segment": seg,
                "orders": o,
                "delivered_pct": (int(row.get("delivered") or 0) / o) if o else 0,
                "rto_pct": curr_rto,
                "rto_delta_pp": curr_rto - prev_rto.get(seg, 0) if seg in prev_rto else None,
                "ndr_pct": (int(row.get("ndr") or 0) / o) if o else 0,
                "in_eta_pct": (int(row.get("in_eta") or 0) / o) if o else 0,
                "first_attempt_pct": (int(row.get("first_attempt") or 0) / o) if o else 0,
                "ord_to_disp_hours": float(row.get("ord_to_disp_hours") or 0),
                "disp_to_pick_days": float(row.get("disp_to_pick_days") or 0),
                "pick_to_del_days": float(row.get("pick_to_del_days") or 0),
                "rto_tat_days": float(row.get("rto_tat_days") or 0),
                "rto_trend_7d": trend_map.get(seg, []),
            })
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- courier × warehouse RTO% matrix ----------
    def courier_wh_matrix(self, f: SupplyChainFilters) -> dict:
        cache_key = f.cache_key("sc_courier_wh_matrix")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        sql = f"""
        SELECT
          courier_partner AS courier,
          Pickup_Warehouse AS warehouse,
          COUNT(name) AS orders,
          COUNTIF(shipment_status IN {rto_in}) AS rto
        FROM {self.table}
        WHERE {where}
          AND courier_partner IS NOT NULL
          AND Pickup_Warehouse IS NOT NULL
        GROUP BY courier, warehouse
        """
        rows = self._run(sql, params)

        by_courier: dict[str, dict[str, dict]] = {}
        warehouses: set[str] = set()
        for r in rows:
            c, w = r["courier"], r["warehouse"]
            warehouses.add(w)
            o = int(r["orders"] or 0)
            rto = int(r["rto"] or 0)
            by_courier.setdefault(c, {})[w] = {
                "orders": o, "rto": rto, "rto_pct": (rto / o) if o else 0,
            }

        wh_list = sorted(warehouses)

        matrix = []
        for courier, by_wh in by_courier.items():
            cells, row_o, row_rto = [], 0, 0
            for wh in wh_list:
                cell = by_wh.get(wh, {"orders": 0, "rto": 0, "rto_pct": 0})
                cells.append({"warehouse": wh, **cell})
                row_o += cell["orders"]
                row_rto += cell["rto"]
            matrix.append({
                "courier": courier,
                "cells": cells,
                "orders": row_o,
                "avg_rto_pct": (row_rto / row_o) if row_o else 0,
            })
        matrix.sort(key=lambda r: -r["orders"])

        wh_avg = []
        for wh in wh_list:
            o, rto = 0, 0
            for r in matrix:
                cell = next((c for c in r["cells"] if c["warehouse"] == wh), None)
                if cell:
                    o += cell["orders"]
                    rto += cell["rto"]
            wh_avg.append({"warehouse": wh, "avg_rto_pct": (rto / o) if o else 0})

        result = {
            "warehouses": wh_list,
            "matrix": matrix,
            "warehouse_avg": wh_avg,
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- top pincodes ----------
    def top_pincodes(self, f: SupplyChainFilters, limit: int = 10) -> list[dict]:
        cache_key = f.cache_key(f"sc_top_pincodes_{limit}")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        rto_in = _sql_in(RTO_STATUSES)
        sql = f"""
        SELECT
          drop_pincode AS pincode,
          ANY_VALUE(drop_city) AS city,
          ANY_VALUE(drop_state) AS state,
          COUNT(name) AS orders,
          COUNTIF(shipment_status IN {rto_in}) AS rto_orders
        FROM {self.table}
        WHERE {where}
          AND drop_pincode IS NOT NULL
        GROUP BY pincode
        HAVING orders > 0
        ORDER BY rto_orders DESC
        LIMIT @limit
        """
        params = params + [bigquery.ScalarQueryParameter("limit", "INT64", limit)]
        rows = self._run(sql, params)
        result = []
        for r in rows:
            o = int(r["orders"] or 0)
            rto = int(r["rto_orders"] or 0)
            result.append({
                "pincode": r["pincode"],
                "city": r["city"],
                "state": r["state"],
                "orders": o,
                "rto_orders": rto,
                "rto_pct": rto / o if o else 0,
                "action": None,  # thresholds pending — keep blank for now
            })
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- delivery day distribution ----------
    def delivery_day_distribution(self, f: SupplyChainFilters) -> list[dict]:
        cache_key = f.cache_key("sc_delivery_day_dist")
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          delivered_day_label AS bucket,
          COUNT(name) AS orders
        FROM {self.table}
        WHERE {where}
          AND delivered_day_label IS NOT NULL
          AND delivered_day_label != 'RTO'
        GROUP BY bucket
        """
        rows = self._run(sql, params)
        named = {"D0": 0, "D1": 0, "D2": 0, "D3": 0, "D4": 0}
        d5plus = 0
        for r in rows:
            b = r["bucket"]
            n = int(r["orders"] or 0)
            if b in named:
                named[b] += n
            else:
                d5plus += n
        result = [{"bucket": b, "orders": named[b]} for b in ["D0", "D1", "D2", "D3", "D4"]]
        result.append({"bucket": "D5+", "orders": d5plus})
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- trend chart ----------
    def trend(
        self,
        f: SupplyChainFilters,
        segment: str,
        metric: str,
        granularity: str,
        sub_filter: str | None,
    ) -> dict:
        """
        segment:     overall | warehouse | courier | payment | daytype
        metric:      rto | orders | eta | ndr | delivered_revenue
        granularity: DoD | WoW | MoM
        sub_filter:  None / 'all' -> overlay all distinct values
                     specific value -> single series for that value
        """
        cache_key = f.cache_key(
            f"sc_trend_{segment}_{metric}_{granularity}_{sub_filter or 'all'}"
        )
        cached = self._get_cache(cache_key)
        if cached:
            return cached

        seg_col = SEGMENT_COLUMNS.get(segment)

        if granularity == "DoD":
            bucket_expr = "FORMAT_DATE('%Y-%m-%d', created_date_in_timezone)"
        elif granularity == "WoW":
            bucket_expr = "FORMAT_DATE('%G-W%V', created_date_in_timezone)"
        else:
            bucket_expr = "FORMAT_DATE('%Y-%m', created_date_in_timezone)"

        rto_in = _sql_in(RTO_STATUSES)
        eta_in = _sql_in(ETA_DAY_LABELS)
        metric_expr = {
            "rto": f"SAFE_DIVIDE(COUNTIF(shipment_status IN {rto_in}), COUNT(name))",
            "orders": "COUNT(name)",
            "eta": f"SAFE_DIVIDE(COUNTIF(delivered_day_label IN {eta_in}), COUNT(name))",
            "ndr": "SAFE_DIVIDE(COUNTIF(out_for_delivery_attempts > 1), COUNT(name))",
            "delivered_revenue":
                f"SUM(IF(shipment_status = '{DELIVERED_STATUS}', total_price, 0))",
        }.get(metric)
        if metric_expr is None:
            metric_expr = (
                f"SAFE_DIVIDE(COUNTIF(shipment_status IN {rto_in}), COUNT(name))"
            )
            metric = "rto"

        where, params = self._where(f)
        select_extras = ""
        group_extras = ""
        if seg_col:
            select_extras = f", {seg_col} AS segment"
            group_extras = f", {seg_col}"
            if sub_filter and sub_filter.lower() != "all":
                where += f" AND {seg_col} = @sub_filter"
                params.append(
                    bigquery.ScalarQueryParameter("sub_filter", "STRING", sub_filter)
                )

        sql = f"""
        SELECT
          {bucket_expr} AS bucket
          {select_extras},
          {metric_expr} AS value
        FROM {self.table}
        WHERE {where}
          {("AND " + seg_col + " IS NOT NULL") if seg_col else ""}
        GROUP BY bucket {group_extras}
        ORDER BY bucket
        """
        rows = self._run(sql, params)

        if seg_col:
            buckets = sorted({r["bucket"] for r in rows})
            series_map: dict[str, list] = {}
            for r in rows:
                seg = r.get("segment") or "Unknown"
                series_map.setdefault(seg, [None] * len(buckets))
                idx = buckets.index(r["bucket"])
                v = r.get("value")
                series_map[seg][idx] = float(v) if v is not None else 0
            series = [{"name": s, "values": v} for s, v in series_map.items()]
        else:
            buckets = [r["bucket"] for r in rows]
            series = [{
                "name": "Overall",
                "values": [float(r["value"] or 0) for r in rows],
            }]

        result = {
            "buckets": buckets,
            "series": series,
            "segment": segment,
            "metric": metric,
            "granularity": granularity,
            "sub_filter": sub_filter or "all",
        }
        self._set_cache(cache_key, result, ttl=3600)
        return result

    # ---------- distinct segment values (for sub-pills) ----------
    def segment_options(self, segment: str) -> list[str]:
        col = SEGMENT_COLUMNS.get(segment)
        if not col:
            return []
        cache_key = f"sc_segment_options:{segment}"
        cached = self._get_cache(cache_key)
        if cached:
            return cached
        sql = f"""
        SELECT DISTINCT {col} AS value
        FROM {self.table}
        WHERE {col} IS NOT NULL
        ORDER BY value
        """
        rows = self._run(sql, [])
        result = [r["value"] for r in rows if r.get("value")]
        self._set_cache(cache_key, result, ttl=86400)
        return result

    def all_segment_options(self) -> dict[str, list[str]]:
        return {seg: self.segment_options(seg) for seg in SEGMENT_COLUMNS}

    # ---------- latest data date (for AI summary) ----------
    def get_latest_date(self) -> date | None:
        sql = f"SELECT MAX(created_date_in_timezone) AS d FROM {self.table}"
        rows = self._run(sql, [])
        if not rows or not rows[0].get("d"):
            return None
        return rows[0]["d"]
