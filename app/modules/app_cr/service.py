"""App CR service — AppsFlyer session data from BigQuery.

Table: innovist-master-data.appsflyer_transformed.appsflyer_data_table_session
"""
from __future__ import annotations

import json
import logging
import redis
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any

from google.cloud import bigquery

from app.config import ANALYTICS_TTL, Settings, make_cache_key

logger = logging.getLogger(__name__)

TABLE = "`innovist-master-data.appsflyer_transformed.appsflyer_data_table_session`"


# ──────────────────────────────────────────────────────────────── filters
@dataclass
class AppCRFilters:
    start_date: date
    end_date: date
    compare_mode: str = "previous_period"
    compare_start: date | None = None
    compare_end: date | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "AppCRFilters":
        if self.compare_start and self.compare_end:
            return replace(
                self,
                start_date=self.compare_start,
                end_date=self.compare_end,
                compare_start=None,
                compare_end=None,
            )
        n = self.length_days
        return replace(
            self,
            start_date=self.start_date - timedelta(days=n),
            end_date=self.end_date - timedelta(days=n),
            compare_start=None,
            compare_end=None,
        )

    def cache_key(self, prefix: str) -> str:
        return make_cache_key(
            "appcr", prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.compare_start.isoformat() if self.compare_start else "",
            self.compare_end.isoformat()   if self.compare_end   else "",
        )


# ──────────────────────────────────────────────────────────────── service
class AppCRService:
    """Service for the App CR dashboard — AppsFlyer session table."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = bigquery.Client(project=settings.gcp_project_id)

        try:
            self.redis_client = redis.Redis(
                host=settings.redis_host,
                port=settings.redis_port,
                db=0,
                decode_responses=True,
                socket_connect_timeout=2,
            )
            self.redis_client.ping()
            self.cache_enabled = True
            logger.info("✅ Redis connected (AppCR service)")
        except Exception as exc:
            logger.warning("⚠️  Redis unavailable: %s", exc)
            self.redis_client = None
            self.cache_enabled = False

    # ── cache helpers ────────────────────────────────────────────────────
    def _get(self, key: str) -> Any | None:
        if not self.cache_enabled:
            return None
        try:
            raw = self.redis_client.get(key)
            if raw:
                logger.info("🎯 Cache HIT  [appcr]: %s", key)
                return json.loads(raw)
            logger.info("❌ Cache MISS [appcr]: %s", key)
            return None
        except Exception:
            return None

    def _set(self, key: str, value: Any, ttl: int = ANALYTICS_TTL) -> None:
        if not self.cache_enabled:
            return
        try:
            self.redis_client.setex(key, ttl, json.dumps(value, default=str))
            logger.info("💾 Cache SET  [appcr]: %s (ttl=%ss)", key, ttl)
        except Exception:
            pass

    # ── BigQuery runner ──────────────────────────────────────────────────
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

    # ── WHERE clause builder ─────────────────────────────────────────────
    def _where(self, f: AppCRFilters) -> tuple[str, list]:
        params = [
            bigquery.ScalarQueryParameter("start_date", "DATE", f.start_date),
            bigquery.ScalarQueryParameter("end_date",   "DATE", f.end_date),
        ]
        return "date BETWEEN @start_date AND @end_date", params

    # ── latest date ──────────────────────────────────────────────────────
    def get_latest_date(self) -> date | None:
        key = "af2:latest_date"
        cached = self._get(key)
        if cached:
            return date.fromisoformat(cached) if isinstance(cached, str) else cached
        sql = f"SELECT date AS d FROM {TABLE} ORDER BY date DESC LIMIT 1 OFFSET 1"
        rows = self._run(sql, [])
        if not rows:
            return None
        v = rows[0].get("d")
        if isinstance(v, str):
            v = date.fromisoformat(v)
        elif isinstance(v, datetime):
            v = v.date()
        self._set(key, v.isoformat() if v else None)
        return v

    # ════════════════════════════════════════════════════════════════════
    #  KPIs
    # ════════════════════════════════════════════════════════════════════
    def kpis(self, f: AppCRFilters) -> dict[str, Any]:
        key = f.cache_key("kpis")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          SUM(install_count)                                                   AS installs,
          SUM(CASE WHEN LOWER(source) = 'organic'
                   THEN install_count ELSE 0 END)                              AS organic_installs,
          SUM(CASE WHEN LOWER(source) != 'organic'
                   THEN install_count ELSE 0 END)                              AS inorganic_installs,
          SUM(uninstall_count)                                                  AS uninstalls,
          SUM(purchases)                                                        AS orders,
          SUM(add_to_cart)                                                      AS atc,
          SUM(revenue)                                                          AS revenue,
          SUM(daily_active_users)                                               AS dau_total,
          COUNT(DISTINCT date)                                                  AS days,
          SAFE_DIVIDE(SUM(purchases),     SUM(daily_active_users))             AS cvr,
          SAFE_DIVIDE(SUM(add_to_cart),   SUM(daily_active_users))             AS atc_rate,
          SAFE_DIVIDE(SUM(revenue),        SUM(purchases))                     AS aov
        FROM {TABLE}
        WHERE {where}
        """
        rows = self._run(sql, params)
        r = rows[0] if rows else {}

        days = int(r.get("days") or 1)
        dau_total = float(r.get("dau_total") or 0)
        result = {
            "installs":           int(r.get("installs") or 0),
            "organic_installs":   int(r.get("organic_installs") or 0),
            "inorganic_installs": int(r.get("inorganic_installs") or 0),
            "uninstalls":         int(r.get("uninstalls") or 0),
            "orders":             int(r.get("orders") or 0),
            "atc":                int(r.get("atc") or 0),
            "revenue":            float(r.get("revenue") or 0),
            "dau":                round(dau_total / days, 0),
            "cvr":                float(r.get("cvr") or 0),
            "atc_rate":           float(r.get("atc_rate") or 0),
            "aov":                float(r.get("aov") or 0),
        }
        self._set(key, result)
        return result

    @staticmethod
    def _delta(curr: dict, prev: dict, keys: list[str]) -> dict[str, float | None]:
        out: dict[str, float | None] = {}
        for k in keys:
            c, p = float(curr.get(k) or 0), float(prev.get(k) or 0)
            out[k] = ((c - p) / p) if p else None
        return out

    def overview(self, f: AppCRFilters) -> dict[str, Any]:
        key = f.cache_key("overview")
        cached = self._get(key)
        if cached is not None:
            return cached

        curr = self.kpis(f)
        prev = self.kpis(f.previous_period())
        delta_keys = ["installs", "inorganic_installs", "uninstalls", "orders",
                      "atc", "atc_rate", "cvr", "aov", "revenue", "dau"]
        result = {
            "current": curr,
            "previous": prev,
            "deltas": self._delta(curr, prev, delta_keys),
        }
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Daily trend  (Overview tab chart)
    # ════════════════════════════════════════════════════════════════════
    def daily_trend(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("trend")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          CAST(date AS STRING)                                                   AS date,
          SUM(install_count)                                                     AS installs,
          SUM(uninstall_count)                                                   AS uninstalls,
          SUM(daily_active_users)                                                AS dau,
          SUM(purchases)                                                         AS orders,
          SUM(revenue)                                                           AS revenue,
          SAFE_DIVIDE(SUM(purchases),   SUM(daily_active_users)) * 100          AS cvr_pct,
          SAFE_DIVIDE(SUM(add_to_cart), SUM(daily_active_users)) * 100          AS atc_rate_pct
        FROM {TABLE}
        WHERE {where}
        GROUP BY date
        ORDER BY date ASC
        """
        rows = self._run(sql, params)
        self._set(key, rows)
        return rows

    # ════════════════════════════════════════════════════════════════════
    #  Funnel  (v3 — DAU-based so all steps stay ≤ 100%)
    # ════════════════════════════════════════════════════════════════════
    def funnel(self, f: AppCRFilters) -> dict[str, Any]:
        key = f.cache_key("funnel_v4")          # v4: add_shipping_info removed
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        # add_shipping_info removed — column does not exist in the actual table
        sql = f"""
        SELECT
          SUM(install_count)      AS installs,
          SUM(daily_active_users) AS dau,
          SUM(view_item)          AS view_item,
          SUM(view_cart)          AS view_cart,
          SUM(add_to_cart)        AS add_to_cart,
          SUM(begin_checkout)     AS begin_checkout,
          SUM(purchases)          AS purchases
        FROM {TABLE}
        WHERE {where}
        """
        rows  = self._run(sql, params)
        r     = rows[0] if rows else {}

        installs = int(r.get("installs") or 0)
        dau      = int(r.get("dau")      or 0)
        vi       = int(r.get("view_item")   or 0)
        vc       = int(r.get("view_cart")   or 0)
        atc      = int(r.get("add_to_cart") or 0)
        bc       = int(r.get("begin_checkout") or 0)
        pur      = int(r.get("purchases")   or 0)

        ordered = [
            ("Active Users",   dau),
            ("Product View",   vi),
            ("View Cart",      vc),
            ("Add to Cart",    atc),
            ("Begin Checkout", bc),
            ("Purchase",       pur),
        ]

        base      = dau or 1
        prev      = base
        steps: list[dict] = []
        for i, (label, cnt) in enumerate(ordered):
            overall   = round(min(cnt / base, 1.0), 4)
            step_cvr  = round(min(cnt / prev, 1.0), 4) if prev else 0
            drop_pct  = round(max((prev - cnt) / prev, 0.0), 4) if (prev and i > 0) else 0
            steps.append({
                "step":        label,
                "count":       cnt,
                "overall_pct": overall,
                "step_cvr":    step_cvr if i > 0 else None,
                "drop_pct":    drop_pct if i > 0 else 0,
            })
            prev = cnt if cnt > 0 else prev

        result = {"installs": installs, "steps": steps}
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Media sources
    # ════════════════════════════════════════════════════════════════════
    def media_sources(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("media")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown') AS channel_group,
          SUM(install_count)                                    AS installs,
          SUM(uninstall_count)                                  AS uninstalls,
          SUM(daily_active_users)                               AS dau,
          SUM(purchases)                                        AS orders,
          SUM(add_to_cart)                                      AS atc,
          SUM(revenue)                                          AS revenue,
          SAFE_DIVIDE(SUM(purchases), SUM(daily_active_users))  AS cvr,
          SAFE_DIVIDE(SUM(add_to_cart), SUM(daily_active_users)) AS atc_rate,
          SAFE_DIVIDE(SUM(revenue), SUM(purchases))             AS aov
        FROM {TABLE}
        WHERE {where}
        GROUP BY channel_group
        HAVING SUM(purchases) > 0 OR SUM(install_count) > 0
        ORDER BY revenue DESC
        LIMIT 20
        """
        rows = self._run(sql, params)
        result = [dict(r) for r in rows]
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Media source CVR daily trend  (multi-line rolling chart)
    # ════════════════════════════════════════════════════════════════════
    def media_trend(self, f: AppCRFilters) -> dict[str, Any]:
        """Return daily CVR % for the top 8 channel_groups.

        Response shape:
          {
            "channels": ["Facebook", "Google", ...],   # ordered by total revenue desc
            "rows": [
              {"date": "2026-04-01", "Facebook": 4.2, "Google": 3.1, ...},
              ...
            ]
          }
        """
        key = f.cache_key("media_trend_v2")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)

        # Step 1: top 8 channels by total revenue in the period
        top_sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown') AS channel,
          SUM(revenue)   AS rev
        FROM {TABLE}
        WHERE {where}
        GROUP BY channel
        HAVING SUM(purchases) > 0
        ORDER BY rev DESC
        LIMIT 8
        """
        top_rows = self._run(top_sql, params)
        channels = [r["channel"] for r in top_rows]

        if not channels:
            result = {"channels": [], "rows": []}
            self._set(key, result)
            return result

        # Step 2: daily CVR per channel
        # HAVING SUM(daily_active_users) >= 30 removes days where a channel had
        # tiny traffic (e.g. 1 session), which causes 100% CVR spikes that make
        # the chart unreadable.
        trend_sql = f"""
        SELECT
          CAST(date AS STRING)                                             AS date,
          COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown')            AS channel,
          ROUND(SAFE_DIVIDE(SUM(purchases), SUM(daily_active_users)) * 100, 2) AS cvr_pct
        FROM {TABLE}
        WHERE {where}
          AND COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown')
              IN UNNEST(@channels)
        GROUP BY date, channel
        HAVING SUM(daily_active_users) >= 30
        ORDER BY date ASC, channel ASC
        """
        trend_params = list(params) + [
            bigquery.ArrayQueryParameter("channels", "STRING", channels)
        ]
        trend_rows = self._run(trend_sql, trend_params)

        # Pivot: {date → {channel → cvr_pct}}
        pivot: dict[str, dict] = {}
        for r in trend_rows:
            d = r["date"]
            if d not in pivot:
                pivot[d] = {"date": d}
            pivot[d][r["channel"]] = r["cvr_pct"]

        rows = sorted(pivot.values(), key=lambda x: x["date"])
        result = {"channels": channels, "rows": rows}
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Campaign breakdown (under Media Sources)
    # ════════════════════════════════════════════════════════════════════
    def campaigns(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("campaigns_v2")   # v2: no LIMIT
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(campaign), ''), '(not set)') AS campaign,
          COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown') AS channel_group,
          SUM(install_count)                                  AS installs,
          SUM(purchases)                                      AS orders,
          SUM(revenue)                                        AS revenue,
          SAFE_DIVIDE(SUM(purchases), SUM(daily_active_users)) AS cvr,
          SAFE_DIVIDE(SUM(revenue),   SUM(purchases))         AS aov
        FROM {TABLE}
        WHERE {where}
        GROUP BY campaign, channel_group
        HAVING SUM(purchases) > 0
        ORDER BY revenue DESC
        """
        rows = self._run(sql, params)
        result = [dict(r) for r in rows]
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Geography
    # ════════════════════════════════════════════════════════════════════
    def geo(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("geo")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(country), ''), 'Unknown') AS country,
          SUM(install_count)                             AS installs,
          SUM(daily_active_users)                        AS dau,
          SUM(purchases)                                 AS orders,
          SUM(revenue)                                   AS revenue,
          SAFE_DIVIDE(SUM(purchases), SUM(daily_active_users)) AS cvr,
          SAFE_DIVIDE(SUM(revenue), SUM(purchases))      AS aov
        FROM {TABLE}
        WHERE {where}
        GROUP BY country
        HAVING SUM(daily_active_users) > 0
        ORDER BY revenue DESC
        LIMIT 25
        """
        rows = self._run(sql, params)
        result = [dict(r) for r in rows]
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  App versions
    # ════════════════════════════════════════════════════════════════════
    def app_versions(self, _: AppCRFilters) -> list[dict[str, Any]]:
        # app_version column does not exist in the deployed table — return empty
        # rather than crashing the whole overview endpoint.
        return []

    # ════════════════════════════════════════════════════════════════════
    #  Installs & uninstalls daily trend
    # ════════════════════════════════════════════════════════════════════
    def install_trend(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("install_trend")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          CAST(date AS STRING)        AS date,
          SUM(install_count)          AS installs,
          SUM(uninstall_count)        AS uninstalls,
          SUM(install_count) - SUM(uninstall_count) AS net_installs,
          SUM(CASE WHEN LOWER(source) != 'organic'
                   THEN install_count ELSE 0 END) AS inorganic_installs,
          SUM(CASE WHEN LOWER(source) = 'organic'
                   THEN install_count ELSE 0 END) AS organic_installs
        FROM {TABLE}
        WHERE {where}
        GROUP BY date
        ORDER BY date ASC
        """
        rows = self._run(sql, params)
        self._set(key, rows)
        return rows

    # ════════════════════════════════════════════════════════════════════
    #  Install attribution (source breakdown for install section)
    # ════════════════════════════════════════════════════════════════════
    def install_attribution(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("inst_attr")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(channel_group), ''), 'Unknown') AS source,
          SUM(install_count)   AS installs,
          SUM(uninstall_count) AS uninstalls,
          SAFE_DIVIDE(SUM(uninstall_count), NULLIF(SUM(install_count), 0)) AS uninstall_rate
        FROM {TABLE}
        WHERE {where}
        GROUP BY source
        HAVING SUM(install_count) > 0
        ORDER BY installs DESC
        LIMIT 15
        """
        rows = self._run(sql, params)
        result = [dict(r) for r in rows]
        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  OS-split funnel  (v3 — DAU-based, same steps as main funnel)
    # ════════════════════════════════════════════════════════════════════
    def os_funnel(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("os_funnel_v4")       # v4: add_shipping_info removed
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        # add_shipping_info removed — column does not exist in the actual table
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(device_OS), ''), 'Unknown') AS os,
          SUM(install_count)      AS installs,
          SUM(daily_active_users) AS dau,
          SUM(view_item)          AS view_item,
          SUM(view_cart)          AS view_cart,
          SUM(add_to_cart)        AS add_to_cart,
          SUM(begin_checkout)     AS begin_checkout,
          SUM(purchases)          AS purchases
        FROM {TABLE}
        WHERE {where}
        GROUP BY os
        HAVING SUM(install_count) > 0
        ORDER BY SUM(install_count) DESC
        LIMIT 5
        """
        rows = self._run(sql, params)

        def _pct_inst(num, inst):
            """% of installs, capped at 100 (legacy bar-chart fields)."""
            return min(round(num / inst * 100, 1), 100.0) if inst else 0.0

        result = []
        for r in rows:
            inst = int(r.get("installs") or 0)
            dau  = int(r.get("dau")      or 0)
            vi   = int(r.get("view_item")   or 0)
            vc   = int(r.get("view_cart")   or 0)
            atc  = int(r.get("add_to_cart") or 0)
            bc   = int(r.get("begin_checkout") or 0)
            pur  = int(r.get("purchases")   or 0)

            # Mirror main funnel: DAU as base so all steps stay ≤ 100 %
            ordered = [
                ("Active Users",   dau),
                ("Product View",   vi),
                ("View Cart",      vc),
                ("Add to Cart",    atc),
                ("Begin Checkout", bc),
                ("Purchase",       pur),
            ]

            base = dau or 1
            prev = base
            steps: list[dict] = []
            for idx, (label, cnt) in enumerate(ordered):
                overall  = round(min(cnt / base, 1.0), 4)
                step_cvr = round(min(cnt / prev, 1.0), 4) if prev else 0
                drop_pct = round(max((prev - cnt) / prev, 0.0), 4) if (prev and idx > 0) else 0
                steps.append({
                    "step":        label,
                    "count":       cnt,
                    "overall_pct": overall,
                    "step_cvr":    step_cvr if idx > 0 else None,
                    "drop_pct":    drop_pct if idx > 0 else 0,
                })
                prev = cnt if cnt > 0 else prev

            result.append({
                "os":       r["os"],
                "installs": inst,
                "dau":      dau,
                "cvr":      round(pur / dau, 6) if dau else 0,  # purchase/DAU
                "steps":    steps,
                # legacy bar-chart rate fields (Overview tab horizontal bars)
                "vi_rate":  _pct_inst(vi,  inst),
                "atc_rate": _pct_inst(atc, inst),
                "vc_rate":  _pct_inst(vc,  inst),
                "bc_rate":  _pct_inst(bc,  inst),
                "pur_rate": _pct_inst(pur, inst),
                "vil_rate": 0,
            })

        self._set(key, result)
        return result

    # ════════════════════════════════════════════════════════════════════
    #  Filtered trend  (for the chart filter controls)
    # ════════════════════════════════════════════════════════════════════
    def filtered_trend(
        self,
        f: AppCRFilters,
        granularity: str = "day",
        os: str = "All",
        install_type: str = "All",
    ) -> list[dict[str, Any]]:
        """Return daily or weekly trend filtered by OS and organic/non-organic."""
        safe_gran   = granularity if granularity in ("day", "week") else "day"
        safe_os     = os if os in ("All", "iOS", "Android") else "All"
        safe_itype  = install_type if install_type in ("All", "Organic", "Non-organic") else "All"

        frag  = f"{safe_gran}:{safe_os}:{safe_itype}"
        key   = f.cache_key(f"ftrend:{frag}")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)

        # OS clause
        if safe_os != "All":
            where += " AND TRIM(device_OS) = @os_val"
            params.append(bigquery.ScalarQueryParameter("os_val", "STRING", safe_os))

        # Install-type clause
        if safe_itype == "Organic":
            where += " AND LOWER(TRIM(source)) = 'organic'"
        elif safe_itype == "Non-organic":
            where += " AND LOWER(TRIM(source)) != 'organic'"

        # Group-by expression
        if safe_gran == "week":
            date_expr = "DATE_TRUNC(date, WEEK)"
        else:
            date_expr = "date"

        sql = f"""
        SELECT
          CAST({date_expr} AS STRING)                                           AS date,
          SUM(install_count)                                                     AS installs,
          SUM(uninstall_count)                                                   AS uninstalls,
          SUM(daily_active_users)                                                AS dau,
          SUM(purchases)                                                         AS orders,
          SUM(revenue)                                                           AS revenue,
          SAFE_DIVIDE(SUM(purchases),   SUM(daily_active_users)) * 100          AS cvr_pct,
          SAFE_DIVIDE(SUM(add_to_cart), SUM(daily_active_users)) * 100          AS atc_rate_pct
        FROM {TABLE}
        WHERE {where}
        GROUP BY date
        ORDER BY date ASC
        """
        rows = self._run(sql, params)
        self._set(key, rows)
        return rows

    # ════════════════════════════════════════════════════════════════════
    #  Deprecated / unused (kept for legacy router compatibility)
    # ════════════════════════════════════════════════════════════════════
    def by_platform(self, f: AppCRFilters) -> list[dict[str, Any]]:
        key = f.cache_key("by_platform")
        cached = self._get(key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
          COALESCE(NULLIF(TRIM(device_OS), ''), 'Unknown') AS platform,
          SUM(daily_active_users)                          AS opens,
          SAFE_DIVIDE(SUM(purchases), SUM(daily_active_users)) AS cr,
          SAFE_DIVIDE(SUM(revenue), SUM(purchases))        AS aov
        FROM {TABLE}
        WHERE {where}
        GROUP BY platform
        HAVING SUM(daily_active_users) > 0
        ORDER BY opens DESC
        """
        rows = self._run(sql, params)
        result = [dict(r) for r in rows]
        self._set(key, result)
        return result

    def push_performance(self, f: AppCRFilters) -> list[dict[str, Any]]:
        return []

    def filter_options(self) -> dict[str, list[str]]:
        return {}
