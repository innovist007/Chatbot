from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta

from app.config import make_cache_key

GRANULARITY_TRUNC = {
    "day":   "DAY",
    "week":  "WEEK(MONDAY)",
    "month": "MONTH",
}


@dataclass
class MetaAdsFilters:
    start_date:     date
    end_date:       date
    campaigns:      list[str] | None = None
    stages:         list[str] | None = None
    creative_types: list[str] | None = None
    brands:         list[str] | None = None
    languages:      list[str] | None = None
    ad_names:       list[str] | None = None
    adset_names:    list[str] | None = None
    compare_start:  date | None = None
    compare_end:    date | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "MetaAdsFilters":
        if self.compare_start and self.compare_end:
            return replace(self, start_date=self.compare_start, end_date=self.compare_end)
        n = self.length_days
        return replace(self,
                       start_date=self.start_date - timedelta(days=n),
                       end_date=self.end_date   - timedelta(days=n))

    def cache_key(self, prefix: str) -> str:
        return make_cache_key(
            "meta", prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.compare_start.isoformat() if self.compare_start else "",
            self.compare_end.isoformat()   if self.compare_end   else "",
            ",".join(sorted(self.campaigns      or [])),
            ",".join(sorted(self.stages         or [])),
            ",".join(sorted(self.creative_types or [])),
            ",".join(sorted(self.brands         or [])),
            ",".join(sorted(self.languages      or [])),
            ",".join(sorted(self.ad_names       or [])),
            ",".join(sorted(self.adset_names    or [])),
        )
