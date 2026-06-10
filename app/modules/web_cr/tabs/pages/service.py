from __future__ import annotations

from dataclasses import replace
from typing import Any

from google.cloud import bigquery

from app.modules.web_cr.base import WebCRBase
from app.modules.web_cr.filters import WebCRFilters


class PagesTabService(WebCRBase):

    def top_landing_pages(self, f: WebCRFilters) -> list[str]:
        """Top 10 landing pages by sessions, ignoring any landing_pages filter
        so the dropdown options remain stable when one is selected."""
        options_filter = replace(f, landing_pages=None)
        cache_key      = options_filter.cache_key("top_landing_pages")
        cached         = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY landing_page
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 10
        """
        rows   = self._run(sql, params)
        result = [r["landing_page"] for r in rows]
        self._set_cache(cache_key, result)
        return result

    def top_content_groups(self, f: WebCRFilters) -> list[str]:
        options_filter = replace(f, content_groups=None)
        cache_key      = options_filter.cache_key("top_content_groups")
        cached         = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(options_filter)
        sql = f"""
        SELECT
            COALESCE(content_group, '(unknown)') AS content_group,
            SUM(sessions) AS total_sessions
        FROM {self.table}
        WHERE {where}
        GROUP BY content_group
        HAVING total_sessions > 0
        ORDER BY total_sessions DESC
        LIMIT 20
        """
        rows   = self._run(sql, params)
        result = [r["content_group"] for r in rows]
        self._set_cache(cache_key, result)
        return result

    def content_group_cr(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("content_group_cr")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(NULLIF(content_group, ''), '(not set)') AS content_group,
            SUM(sessions) AS sessions,
            SUM(purchases) AS purchases,
            SAFE_DIVIDE(SUM(purchases), SUM(sessions)) AS cr,
            SUM(revenue) AS revenue
        FROM {self.table}
        WHERE {where}
        GROUP BY content_group
        HAVING sessions > 0
        ORDER BY sessions DESC
        LIMIT 10
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def product_pages(self, f: WebCRFilters) -> list[dict[str, Any]]:
        cache_key = f.cache_key("product_pages")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(landing_page, '(unknown)') AS landing_page,
            SUM(sessions) AS sessions,
            SUM(views) AS pdp_views,
            SUM(add_to_cart) AS add_to_cart,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(add_to_cart), NULLIF(SUM(views), 0)) AS atc_rate,
            SAFE_DIVIDE(SUM(purchases), NULLIF(SUM(sessions), 0)) AS cr
        FROM {self.table}
        WHERE {where}
          AND (LOWER(landing_page) LIKE '/product%' OR LOWER(landing_page) LIKE '%/products/%')
        GROUP BY landing_page
        HAVING pdp_views > 0
        ORDER BY revenue DESC
        LIMIT 50
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result

    def landing_page_funnel_trend(self, f: WebCRFilters, top_n: int = 10) -> dict[str, Any]:
        cache_key = f.cache_key(f"lp_funnel_trend_v2_top{top_n}")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        top_pages = self.top_landing_pages(f)[:top_n]
        if not top_pages:
            result = {"names": [], "series": {}}
            self._set_cache(cache_key, result)
            return result

        where, params = self._where(f)

        NULL_LABEL  = "(unknown)"
        real_pages  = [p for p in top_pages if p != NULL_LABEL]
        has_unknown = NULL_LABEL in top_pages

        if real_pages:
            params = params + [bigquery.ArrayQueryParameter("top_pages", "STRING", real_pages)]
            lp_filter = (
                "COALESCE(landing_page, '(unknown)') IN UNNEST(@top_pages)"
                if not has_unknown
                else "(landing_page IN UNNEST(@top_pages) OR landing_page IS NULL)"
            )
        else:
            lp_filter = "landing_page IS NULL"

        sql = f"""
        SELECT
            date,
            COALESCE(landing_page, '{NULL_LABEL}') AS landing_page,
            SUM(sessions)          AS sessions,
            SUM(add_to_cart)       AS add_to_cart,
            SUM(view_cart)         AS view_cart,
            SUM(begin_checkout)    AS begin_checkout,
            SUM(add_shipping_info) AS add_shipping_info,
            SUM(add_payment_info)  AS add_payment_info,
            SUM(purchases)         AS purchases
        FROM {self.table}
        WHERE {where}
          AND ({lp_filter})
        GROUP BY date, landing_page
        ORDER BY date, landing_page
        """
        rows   = self._run(sql, params)
        result = self._build_segmented_funnel_trend(rows, "landing_page", top_pages)
        self._set_cache(cache_key, result)
        return result
