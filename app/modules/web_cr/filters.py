from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date, timedelta

from app.config import make_cache_key


@dataclass
class WebCRFilters:
    start_date:     date
    end_date:       date
    compare_mode:   str = "MoM"
    compare_start:  date | None = None
    compare_end:    date | None = None
    channel_groups: list[str] | None = None
    devices:        list[str] | None = None
    countries:      list[str] | None = None
    campaigns:      list[str] | None = None
    content_groups: list[str] | None = None
    landing_pages:  list[str] | None = None
    session_types:  list[str] | None = None

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> "WebCRFilters":
        if self.compare_start and self.compare_end:
            return replace(self, start_date=self.compare_start, end_date=self.compare_end)
        n = self.length_days
        m = self.compare_mode
        if m == "DoD":
            shift = n
        elif m == "WoW":
            shift = 7
        elif m == "YoY":
            shift = 365
        else:
            shift = 30
        return replace(self,
                       start_date=self.start_date - timedelta(days=shift),
                       end_date=self.end_date   - timedelta(days=shift))

    def cache_key(self, prefix: str) -> str:
        return make_cache_key(
            "webcr", prefix,
            self.start_date.isoformat(),
            self.end_date.isoformat(),
            self.compare_start.isoformat() if self.compare_start else "",
            self.compare_end.isoformat()   if self.compare_end   else "",
            ",".join(sorted(self.channel_groups or [])),
            ",".join(sorted(self.devices        or [])),
            ",".join(sorted(self.countries      or [])),
            ",".join(sorted(self.campaigns      or [])),
            ",".join(sorted(self.content_groups or [])),
            ",".join(sorted(self.landing_pages  or [])),
            ",".join(sorted(s.lower() for s in (self.session_types or []))),
        )
