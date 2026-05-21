"""Integration tests for /web-cr/* endpoints."""
import pytest


BASE = "/web-cr"
DATES = "start_date=2026-01-01&end_date=2026-01-31"


def _get(client, path="", extra=""):
    qs = f"?{DATES}&{extra}" if extra else f"?{DATES}"
    return client.get(f"{BASE}{path}{qs}")


class TestRequiresAuth:
    @pytest.mark.parametrize("path", ["", "/filter-options"])
    def test_401_without_token(self, unauth_client, path):
        r = unauth_client.get(f"{BASE}{path}?{DATES}")
        assert r.status_code == 401


class TestWebCROverview:
    def test_returns_200(self, client):
        assert _get(client).status_code == 200

    def test_response_is_json(self, client):
        r = _get(client)
        assert r.headers["content-type"].startswith("application/json")

    def test_channel_filter_accepted(self, client):
        r = _get(client, extra="channel_groups=Organic+Search")
        assert r.status_code == 200

    def test_device_filter_accepted(self, client):
        r = _get(client, extra="devices=mobile")
        assert r.status_code == 200

    def test_country_filter_accepted(self, client):
        r = _get(client, extra="countries=India")
        assert r.status_code == 200

    def test_no_dates_defaults(self, client):
        r = client.get(f"{BASE}")
        assert r.status_code == 200


class TestFilterOptions:
    def test_returns_200(self, client):
        r = _get(client, "/filter-options")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = _get(client, "/filter-options")
        assert r.headers["content-type"].startswith("application/json")


class TestAiSummary:
    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_returns_200_or_error(self, client):
        r = _get(client, "/ai-summary")
        assert r.status_code in (200, 500, 503)
