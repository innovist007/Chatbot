"""BaseFilter — shared date-range + compare-mode logic for all services."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass
class BaseFilter:
    """
    Inherit from this in every service-level filter dataclass.

    Eliminates the copy-pasted cache_key() and previous_period() methods
    that previously lived in each of the 10 service files.
    """

    start_date: date
    end_date: date
    compare_mode: str = "MoM"

    # ------------------------------------------------------------------ helpers

    @property
    def length_days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def previous_period(self) -> tuple[date, date]:
        n = self.length_days
        m = self.compare_mode
        if m == "DoD":
            return (self.start_date - timedelta(days=n),  self.end_date - timedelta(days=n))
        if m == "WoW":
            return (self.start_date - timedelta(days=7),  self.end_date - timedelta(days=7))
        if m == "MoM":
            return (self.start_date - timedelta(days=30), self.end_date - timedelta(days=30))
        if m == "YoY":
            return (self.start_date - timedelta(days=365), self.end_date - timedelta(days=365))
        # fallback: shift back by same window length
        return (self.start_date - timedelta(days=n), self.end_date - timedelta(days=n))

    def cache_key(self, prefix: str, *extra: str) -> str:
        """
        Deterministic Redis key.
        Pass extra strings for any filter fields beyond date/compare_mode.
        """
        parts = [prefix, self.start_date.isoformat(), self.end_date.isoformat(), self.compare_mode]
        parts.extend(str(e) for e in extra if e)
        return ":".join(parts)
