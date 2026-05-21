"""Integration tests for /acquisition/* endpoints (Meta Ads + Partnerships)."""
import pytest


BASE = "/acquisition"
DATES = "start_date=2026-01-01&end_date=2026-01-31"


def _get(client, path, extra=""):
    qs = f"?{DATES}&{extra}" if extra else f"?{DATES}"
    return client.get(f"{BASE}{path}{qs}")


class TestRequiresAuth:
    PATHS = [
        "/overview", "/trend", "/table",
        "/filter-options", "/partnership",
    ]

    @pytest.mark.parametrize("path", PATHS)
    def test_401_without_token(self, unauth_client, path):
        r = unauth_client.get(f"{BASE}{path}?{DATES}")
        assert r.status_code == 401


class TestOverview:
    def test_returns_200(self, client):
        assert _get(client, "/overview").status_code == 200

    def test_no_dates_returns_200(self, client):
        r = client.get(f"{BASE}/overview")
        assert r.status_code == 200

    def test_brand_filter_accepted(self, client):
        r = _get(client, "/overview", "brands=BareAnatomy")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = _get(client, "/overview")
        assert r.headers["content-type"].startswith("application/json")


class TestTrend:
    def test_returns_200(self, client):
        r = _get(client, "/trend", "granularity=day")
        assert r.status_code == 200

    def test_weekly_granularity(self, client):
        r = _get(client, "/trend", "granularity=week")
        assert r.status_code == 200

    def test_monthly_granularity(self, client):
        r = _get(client, "/trend", "granularity=month")
        assert r.status_code == 200


class TestTable:
    def test_campaign_level(self, client):
        r = _get(client, "/table", "level=campaign")
        assert r.status_code == 200

    def test_ad_level(self, client):
        r = _get(client, "/table", "level=ad")
        assert r.status_code == 200

    def test_default_level(self, client):
        r = _get(client, "/table")
        assert r.status_code == 200


class TestFilterOptions:
    def test_returns_200(self, client):
        r = client.get(f"{BASE}/filter-options?{DATES}")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = client.get(f"{BASE}/filter-options?{DATES}")
        assert r.headers["content-type"].startswith("application/json")


class TestPartnership:
    def test_returns_200(self, client):
        assert _get(client, "/partnership").status_code == 200

    def test_source_filter_accepted(self, client):
        r = _get(client, "/partnership", "sources=gpay&sources=phonepe")
        assert r.status_code == 200

    def test_compare_mode_accepted(self, client):
        r = _get(client, "/partnership", "compare_mode=WoW")
        assert r.status_code == 200

    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/partnership?{DATES}")
        assert r.status_code == 401


class TestAiSummary:
    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_returns_200_or_error(self, client):
        r = _get(client, "/ai-summary")
        assert r.status_code in (200, 500, 503)
