from __future__ import annotations

from typing import Any

from app.modules.web_cr.base import WebCRBase
from app.modules.web_cr.filters import WebCRFilters


class CampaignsTabService(WebCRBase):

    def top_campaigns(self, f: WebCRFilters) -> list[dict[str, Any]]:
        """Campaign-level funnel rollup — sessions, ATC, begin_checkout,
        purchases, CVR, AOV, revenue. Excludes empty campaign names."""
        cache_key = f.cache_key("top_campaigns")
        cached    = self._get_cache(cache_key)
        if cached is not None:
            return cached

        where, params = self._where(f)
        sql = f"""
        SELECT
            COALESCE(NULLIF(campaign, ''), '(not set)') AS campaign,
            SUM(sessions) AS sessions,
            SUM(add_to_cart) AS add_to_cart,
            SUM(begin_checkout) AS begin_checkout,
            SUM(purchases) AS purchases,
            SUM(revenue) AS revenue,
            SAFE_DIVIDE(SUM(purchases), NULLIF(SUM(sessions), 0)) AS cr,
            SAFE_DIVIDE(SUM(revenue), NULLIF(SUM(purchases), 0)) AS aov
        FROM {self.table}
        WHERE {where}
        GROUP BY campaign
        HAVING sessions > 0
        ORDER BY revenue DESC
        LIMIT 50
        """
        result = self._run(sql, params)
        self._set_cache(cache_key, result)
        return result
