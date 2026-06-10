from __future__ import annotations

from dataclasses import replace
from datetime import timedelta
from typing import Any

from google.cloud import bigquery

from app.modules.web_cr.base import WebCRBase
from app.modules.web_cr.filters import WebCRFilters


class ChannelsTabService(WebCRBase):

    def top_channels(self, f: WebCRFilters) -> list[str]:
        """All channel_group values ordered by sessions desc, ignoring any
        channel_groups filter so the option list stays stable when one is picked."""
        options_filter = replace(f, channel_groups=None)
        cache_key      = options_filter.cache_key("top_channels")
        cached         = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel_group,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY channel_group
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 30
        """
        rows   = self._run(sql, params)
        result = [r["channel_group"] for r in rows]
        self._set_cache(cache_key, result)
        return result

    def funnel_by_channel(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("funnel_by_channel")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions) AS sessions,
            SUM(views) AS views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(purchases) AS purchases
        FROM {self.table}
        WHERE {where}
        GROUP BY channel
        ORDER BY sessions DESC
        LIMIT 10
        """
        rows   = self._run(sql, params)
        result = []
        for r in rows:
            sess = r.get("sessions") or 0
            atc  = r.get("add_to_cart") or 0
            bc   = r.get("begin_checkout") or 0
            pur  = r.get("purchases") or 0
            result.append({
                "channel":       r["channel"],
                "sessions":      sess,
                "atc_rate":      (atc / sess) if sess else 0,
                "checkout_cr":   (bc / atc) if atc else 0,
                "purchase_rate": (pur / sess) if sess else 0,
            })
        self._set_cache(cache_key, result)
        return result

    def channel_table(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("channel_table")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql_curr = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where}
        GROUP BY channel
        ORDER BY sessions DESC
        LIMIT 20
        """
        curr_rows = self._run(sql_curr, params)

        yoy_filter = replace(
            f,
            start_date=f.start_date - timedelta(days=365),
            end_date=f.end_date   - timedelta(days=365),
        )
        where_yoy, params_yoy = self._where(yoy_filter)
        sql_yoy = f"""
        SELECT
            COALESCE(channel_group, '(unknown)') AS channel,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr_yoy
        FROM {self.table}
        WHERE {where_yoy}
        GROUP BY channel
        """
        try:
            yoy_map = {r["channel"]: r.get("cr_yoy") for r in self._run(sql_yoy, params_yoy)}
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("channel_table YoY query failed (%s)", exc)
            yoy_map = {}

        result = []
        for r in curr_rows:
            cr      = r.get("cr") or 0
            cr_yoy  = yoy_map.get(r["channel"])
            yoy_delta = ((cr - cr_yoy) / cr_yoy) if cr_yoy else None
            result.append({**r, "yoy_delta": yoy_delta})

        self._set_cache(cache_key, result)
        return result

    def channel_trend(self, f: WebCRFilters, top_n: int = 5) -> dict[str, Any]:
        cache_key = f.cache_key(f"channel_trend_top{top_n}")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top = self.top_channels(f)[:top_n]
        if not top:
            empty = {"channels": [], "rows": []}
            self._set_cache(cache_key, empty)
            return empty

        where, params = self._where(f)
        params = params + [bigquery.ArrayQueryParameter("top_channels", "STRING", top)]
        sql = f"""
        SELECT
            date,
            COALESCE(channel_group, '(unknown)') AS channel,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr
        FROM {self.table}
        WHERE {where}
          AND channel_group IN UNNEST(@top_channels)
        GROUP BY date, channel
        ORDER BY date, channel
        """
        rows = self._run(sql, params)

        pivot: dict[str, dict[str, Any]] = {}
        for r in rows:
            d      = r["date"]
            bucket = pivot.setdefault(d, {"date": d})
            bucket[r["channel"]] = r.get("cr") or 0

        out_rows = [pivot[d] for d in sorted(pivot.keys())]
        result   = {"channels": top, "rows": out_rows}
        self._set_cache(cache_key, result)
        return result

    def channel_funnel_trend(self, f: WebCRFilters, top_n: int = 5) -> dict[str, Any]:
        cache_key = f.cache_key(f"channel_funnel_trend_v2_top{top_n}")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top = self.top_channels(f)[:top_n]
        if not top:
            result = {"names": [], "series": {}}
            self._set_cache(cache_key, result)
            return result

        where, params = self._where(f)
        params = params + [bigquery.ArrayQueryParameter("top_channels", "STRING", top)]
        sql = f"""
        SELECT
            date,
            COALESCE(channel_group, '(unknown)') AS channel,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
          AND channel_group IN UNNEST(@top_channels)
        GROUP BY date, channel
        ORDER BY date, channel
        """
        rows   = self._run(sql, params)
        result = self._build_segmented_funnel_trend(rows, "channel", top)
        self._set_cache(cache_key, result)
        return result
