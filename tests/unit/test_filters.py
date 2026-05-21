"""Unit tests for BaseFilter (app/core/filters.py)."""
from datetime import date

import pytest

from app.core.filters import BaseFilter


@pytest.fixture
def f30():
    """30-day filter: 2026-01-01 → 2026-01-30."""
    return BaseFilter(start_date=date(2026, 1, 1), end_date=date(2026, 1, 30))


@pytest.fixture
def f1():
    """Single-day filter."""
    return BaseFilter(start_date=date(2026, 3, 15), end_date=date(2026, 3, 15))


# ── length_days ────────────────────────────────────────────────────────────

class TestLengthDays:
    def test_30_day_window(self, f30):
        assert f30.length_days == 30

    def test_single_day_window(self, f1):
        assert f1.length_days == 1

    def test_7_day_window(self):
        f = BaseFilter(start_date=date(2026, 2, 1), end_date=date(2026, 2, 7))
        assert f.length_days == 7


# ── previous_period ────────────────────────────────────────────────────────

class TestPreviousPeriod:
    def test_mom_shifts_30_days(self, f30):
        prev_start, prev_end = f30.previous_period()
        assert prev_start == date(2025, 12, 2)
        assert prev_end   == date(2025, 12, 31)

    def test_wow_shifts_7_days(self, f30):
        f = BaseFilter(start_date=date(2026, 2, 8), end_date=date(2026, 2, 14), compare_mode="WoW")
        prev_start, prev_end = f.previous_period()
        assert prev_start == date(2026, 2, 1)
        assert prev_end   == date(2026, 2, 7)

    def test_dod_shifts_by_window_length(self):
        f = BaseFilter(start_date=date(2026, 3, 5), end_date=date(2026, 3, 5), compare_mode="DoD")
        prev_start, prev_end = f.previous_period()
        assert prev_start == date(2026, 3, 4)
        assert prev_end   == date(2026, 3, 4)

    def test_yoy_shifts_365_days(self, f30):
        f = BaseFilter(start_date=date(2026, 1, 1), end_date=date(2026, 1, 30), compare_mode="YoY")
        prev_start, prev_end = f.previous_period()
        assert prev_start == date(2025, 1, 1)
        assert prev_end   == date(2025, 1, 30)

    def test_unknown_mode_falls_back_to_window(self):
        f = BaseFilter(start_date=date(2026, 2, 1), end_date=date(2026, 2, 7), compare_mode="UNKNOWN")
        prev_start, prev_end = f.previous_period()
        assert (f.start_date - prev_start).days == f.length_days


# ── cache_key ──────────────────────────────────────────────────────────────

class TestCacheKey:
    def test_basic_key_structure(self, f30):
        key = f30.cache_key("dashboard")
        assert key == "dashboard:2026-01-01:2026-01-30:MoM"

    def test_extra_params_appended(self, f30):
        key = f30.cache_key("svc", "brand_X", "channel_Y")
        assert "brand_X" in key
        assert "channel_Y" in key

    def test_empty_extras_ignored(self, f30):
        key_without = f30.cache_key("svc")
        key_with_empty = f30.cache_key("svc", "", None)
        assert key_without == key_with_empty

    def test_different_dates_different_keys(self):
        f_a = BaseFilter(start_date=date(2026, 1, 1), end_date=date(2026, 1, 31))
        f_b = BaseFilter(start_date=date(2026, 2, 1), end_date=date(2026, 2, 28))
        assert f_a.cache_key("svc") != f_b.cache_key("svc")

    def test_different_compare_modes_different_keys(self, f30):
        key_mom = f30.cache_key("svc")
        f_wow = BaseFilter(
            start_date=f30.start_date, end_date=f30.end_date, compare_mode="WoW"
        )
        assert key_mom != f_wow.cache_key("svc")
