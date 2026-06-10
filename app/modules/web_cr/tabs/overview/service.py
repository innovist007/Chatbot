from __future__ import annotations

from dataclasses import replace
from typing import Any

from app.modules.web_cr.base import WebCRBase
from app.modules.web_cr.filters import WebCRFilters


class OverviewTabService(WebCRBase):

    def overview(self, f: WebCRFilters) -> dict[str, Any]:
        cache_key = f.cache_key("overview_v2")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        curr   = self._derive(self._aggregates(f))
        prev   = self._derive(self._aggregates(f.previous_period()))
        result = {
            "current":       curr,
            "previous":      prev,
            "deltas":        self._delta(curr, prev),
            "compare_label": f"vs prev. {f.length_days}d",
        }
        self._set_cache(cache_key, result)
        return result

    def funnel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_v3")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        a        = self._aggregates(f)
        sessions = a.get("sessions") or 0
        steps = [
            ("Sessions",       a.get("sessions"),          None),
            ("Add to cart",    a.get("add_to_cart"),       "sessions"),
            ("View cart",      a.get("view_cart"),         "add_to_cart"),
            ("Begin checkout", a.get("begin_checkout"),    "view_cart"),
            ("Shipping info",  a.get("add_shipping_info"), "begin_checkout"),
            ("Payment info",   a.get("add_payment_info"),  "add_shipping_info"),
            ("Purchase",       a.get("purchases"),         "add_payment_info"),
        ]

        out: list[dict[str, Any]] = []
        prev_count: float | None  = None
        for label, cnt, _ in steps:
            cnt_f     = cnt or 0
            step_conv = (cnt_f / prev_count) if prev_count else 1.0
            drop_pct  = (1 - step_conv) if prev_count else 0
            overall   = (cnt_f / sessions) if sessions else 0
            out.append({
                "step":             label,
                "count":            cnt_f,
                "step_conversion":  step_conv,
                "drop":             drop_pct,
                "overall_pct":      overall,
            })
            prev_count = cnt_f

        self._set_cache(cache_key, out)
        return out

    def by_source(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_source")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

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
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def by_device(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_device")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

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
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def by_country(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_country")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

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
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def landing_pages(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("landing")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

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
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def by_hour(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("by_hour")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

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
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def cr_trend(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("cr_trend_v2")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            date,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SUM(revenue) AS revenue,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN sessions ELSE 0 END) AS returning_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE sessions END) AS new_sessions,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN purchases ELSE 0 END) AS returning_purchases,
            SUM(CASE WHEN LOWER(IFNULL(session_type, '')) LIKE '%return%' THEN 0 ELSE purchases END) AS new_purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        rows   = self._run(sql, params)
        result = []
        for r in rows:
            ret_s = r.get("returning_sessions") or 0
            new_s = r.get("new_sessions") or 0
            ret_p = r.get("returning_purchases") or 0
            new_p = r.get("new_purchases") or 0
            r["returning_cr"] = (ret_p / ret_s) if ret_s else 0
            r["new_cr"]       = (new_p / new_s) if new_s else 0
            result.append(r)
        self._set_cache(cache_key, result)
        return result

    def funnel_by_device(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_by_device_v2")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(device_category, '(unknown)') AS device,
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(view_cart) AS view_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info) AS add_payment_info,
            SUM(purchases) AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY device
        ORDER BY sessions DESC
        """
        rows   = self._run(sql, params)
        result = []
        for r in rows:
            sess  = r.get("sessions") or 0
            steps = [
                ("Sessions",       r.get("sessions") or 0),
                ("Add to cart",    r.get("add_to_cart") or 0),
                ("View cart",      r.get("view_cart") or 0),
                ("Begin checkout", r.get("begin_checkout") or 0),
                ("Shipping info",  r.get("add_shipping_info") or 0),
                ("Payment info",   r.get("add_payment_info") or 0),
                ("Purchase",       r.get("purchases") or 0),
            ]
            out_steps = []
            prev = None
            for label, count in steps:
                step_conv = (count / prev) if prev else 1.0
                overall   = (count / sess) if sess else 0
                out_steps.append({
                    "step":             label,
                    "count":            count,
                    "overall_pct":      overall,
                    "step_conversion":  step_conv,
                    "drop":             (1 - step_conv) if prev else 0,
                })
                prev = count
            result.append({
                "device":  r["device"],
                "sessions": sess,
                "cr":      ((r.get("purchases") or 0) / sess) if sess else 0,
                "steps":   out_steps,
            })
        self._set_cache(cache_key, result)
        return result

    def funnel_hourly_heatmap(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_hourly_heatmap")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            EXTRACT(DAYOFWEEK FROM date) AS dow,
            CAST(hour AS INT64) AS hour,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where} AND hour IS NOT NULL
        GROUP BY dow, hour
        ORDER BY dow, hour
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def page_funnel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("page_funnel")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS total_sessions,
            SUM(views) AS total_views,
            SUM(add_to_cart) AS total_atc
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        HAVING total_views > 0
        ORDER BY total_views DESC
        LIMIT 15
        """
        rows   = self._run(sql, params)
        result = []
        for r in rows:
            views = r.get("total_views") or 0
            atc   = r.get("total_atc") or 0
            result.append({
                "landing_page": r["landing_page"],
                "sessions":     r.get("total_sessions") or 0,
                "views":        views,
                "add_to_cart":  atc,
                "atc_rate":     (atc / views) if views else 0,
            })
        self._set_cache(cache_key, result)
        return result

    def funnel_trend(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_trend_v1")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            date,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY date
        ORDER BY date
        """
        rows   = self._run(sql, params)
        result = [{"date": r["date"], **self._funnel_row(r)} for r in rows]
        self._set_cache(cache_key, result)
        return result
