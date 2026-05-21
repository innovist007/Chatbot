"""Integration tests for /dashboard/* endpoints."""
import pytest


BASE = "/dashboard"
DATE_PARAMS = "?start_date=2026-01-01&end_date=2026-01-31"


class TestD2CSales:
    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/d2c-sales{DATE_PARAMS}")
        assert r.status_code == 401

    def test_returns_200_with_auth(self, client):
        r = client.get(f"{BASE}/d2c-sales{DATE_PARAMS}")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = client.get(f"{BASE}/d2c-sales{DATE_PARAMS}")
        assert r.headers["content-type"].startswith("application/json")

    def test_default_dates_used_when_omitted(self, client):
        r = client.get(f"{BASE}/d2c-sales")
        assert r.status_code == 200

    def test_invalid_date_range_returns_400(self, client):
        r = client.get(f"{BASE}/d2c-sales?start_date=2026-02-01&end_date=2026-01-01")
        assert r.status_code == 400

    def test_timeframe_param_accepted(self, client):
        # Allowed values: day|week|month|quarter|year (pattern on router)
        r = client.get(f"{BASE}/d2c-sales{DATE_PARAMS}&timeframe=week")
        assert r.status_code == 200

    def test_platform_filter_accepted(self, client):
        r = client.get(f"{BASE}/d2c-sales{DATE_PARAMS}&platform_types=Web&platform_types=App")
        assert r.status_code == 200

    def test_payment_mode_filter_accepted(self, client):
        r = client.get(f"{BASE}/d2c-sales{DATE_PARAMS}&payment_modes=COD&payment_modes=Prepaid")
        assert r.status_code == 200


class TestFilterOptions:
    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/filter-options")
        assert r.status_code == 401

    def test_returns_200_with_auth(self, client):
        r = client.get(f"{BASE}/filter-options")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = client.get(f"{BASE}/filter-options")
        assert r.headers["content-type"].startswith("application/json")
