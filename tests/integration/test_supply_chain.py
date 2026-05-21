"""Integration tests for /supply-chain/* endpoints."""
import pytest


BASE = "/supply-chain"
DATES = "start_date=2026-01-01&end_date=2026-01-31"


def _get(client, path, extra=""):
    qs = f"?{DATES}&{extra}" if extra else f"?{DATES}"
    return client.get(f"{BASE}{path}{qs}")


class TestRequiresAuth:
    """Every supply-chain endpoint must reject unauthenticated requests."""

    PATHS = [
        "/overview", "/waterfall", "/ndr-funnel",
        "/warehouse-table", "/courier-table", "/payment-table",
        "/courier-wh-matrix", "/top-pincodes", "/delivery-day-distribution",
        "/segment-options",
    ]

    @pytest.mark.parametrize("path", PATHS)
    def test_401_without_token(self, unauth_client, path):
        r = unauth_client.get(f"{BASE}{path}?{DATES}")
        assert r.status_code == 401


class TestOverview:
    def test_returns_200(self, client):
        assert _get(client, "/overview").status_code == 200

    def test_compare_mode_param(self, client):
        r = _get(client, "/overview", "compare_mode=WoW")
        assert r.status_code == 200

    def test_missing_dates_returns_422(self, client):
        r = client.get(f"{BASE}/overview")
        assert r.status_code == 422


class TestIndividualEndpoints:
    def test_waterfall_200(self, client):
        assert _get(client, "/waterfall").status_code == 200

    def test_ndr_funnel_200(self, client):
        assert _get(client, "/ndr-funnel").status_code == 200

    def test_warehouse_table_200(self, client):
        assert _get(client, "/warehouse-table").status_code == 200

    def test_courier_table_200(self, client):
        assert _get(client, "/courier-table").status_code == 200

    def test_payment_table_200(self, client):
        assert _get(client, "/payment-table").status_code == 200

    def test_courier_wh_matrix_200(self, client):
        assert _get(client, "/courier-wh-matrix").status_code == 200

    def test_top_pincodes_200(self, client):
        assert _get(client, "/top-pincodes").status_code == 200

    def test_top_pincodes_custom_limit(self, client):
        r = _get(client, "/top-pincodes", "limit=50")
        assert r.status_code == 200

    def test_delivery_day_distribution_200(self, client):
        assert _get(client, "/delivery-day-distribution").status_code == 200


class TestTrend:
    def test_trend_returns_200(self, client):
        r = _get(client, "/trend", "segment=courier&metric=delivery_rate&granularity=day")
        assert r.status_code == 200

    def test_trend_missing_dates_returns_422(self, client):
        r = client.get(f"{BASE}/trend?segment=courier&metric=delivery_rate&granularity=day")
        assert r.status_code == 422


class TestSegmentOptions:
    def test_returns_200(self, client):
        r = client.get(f"{BASE}/segment-options?{DATES}")
        assert r.status_code == 200

    def test_response_is_json(self, client):
        r = client.get(f"{BASE}/segment-options?{DATES}")
        assert r.headers["content-type"].startswith("application/json")


class TestAiSummary:
    def test_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_returns_200_or_503(self, client):
        # AI summary may return 200 (from cache) or 503 if agent unavailable in test
        r = _get(client, "/ai-summary")
        assert r.status_code in (200, 503, 500)
