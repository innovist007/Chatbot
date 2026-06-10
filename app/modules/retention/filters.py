from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.config import make_cache_key

SEGMENT_COL = {
    "brand":    "acquisition_brand",
    "product":  "acquisition_product",
    "channel":  "acquisition_channel",
    "discount": "acquisition_discount_segment",
    "payment":  "acquisition_payment_mode",
    "platform": "acquisition_platform",
}

WINDOW_DAYS = {
    "7d": 7, "14d": 14, "30d": 30, "60d": 60,
    "90d": 90, "120d": 120, "180d": 180, "360d": 360,
}

# Cohort time-bucket granularity for the trend X-axis. Maps the UI pill to the
# BigQuery DATE_TRUNC grain applied to first_order_date.
GRAIN_TRUNC = {
    "DoD": "DAY",
    "WoW": "WEEK(MONDAY)",
    "MoM": "MONTH",
    "YoY": "YEAR",
}


@dataclass
class RetentionFilters:
    start_date: date
    end_date:   date
    brands:     list[str] | None = None

    def cache_key(self, prefix: str) -> str:
        return make_cache_key(
            "retention", prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            ",".join(sorted(self.brands or [])),
        )

    def cache_key_by_end(self, prefix: str) -> str:
        # Uses end_date only — queries with a fixed 12-month lookback
        # are independent of start_date, so the cache stays valid when
        # the user changes the date-picker start without changing end.
        return make_cache_key(
            "retention", f"{prefix}:by_end",
            self.end_date.isoformat(),
            ",".join(sorted(self.brands or [])),
        )

    @property
    def cohort_start(self) -> str:
        return self.start_date.strftime("%Y-%m")

    @property
    def cohort_end(self) -> str:
        return self.end_date.strftime("%Y-%m")
