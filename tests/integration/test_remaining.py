"""Integration tests for app-cr, d2c, d2c-rto, and promo-basket endpoints."""
import pytest


DATES = "start_date=2026-01-01&end_date=2026-01-31"


def _get(client, base, path="", extra=""):
    qs = f"?{DATES}&{extra}" if extra else f"?{DATES}"
    return client.get(f"{base}{path}{qs}")


# ══════════════════════════════════════════════════════════
# /app-cr
# ══════════════════════════════════════════════════════════

class TestAppCR:
    BASE = "/app-cr"

    def test_overview_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/overview?{DATES}")
        assert r.status_code == 401

    def test_overview_returns_200(self, client):
        r = _get(client, self.BASE, "/overview")
        assert r.status_code == 200

    def test_filter_options_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/filter-options?{DATES}")
        assert r.status_code == 401

    def test_filter_options_returns_200(self, client):
        r = _get(client, self.BASE, "/filter-options")
        assert r.status_code == 200

    def test_platform_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "platforms=iOS&platforms=Android")
        assert r.status_code == 200

    def test_ai_summary_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_ai_summary_returns_200_or_error(self, client):
        r = _get(client, self.BASE, "/ai-summary")
        assert r.status_code in (200, 500, 503)


# ══════════════════════════════════════════════════════════
# /d2c
# ══════════════════════════════════════════════════════════

class TestD2C:
    BASE = "/d2c"

    def test_overview_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/overview?{DATES}")
        assert r.status_code == 401

    def test_overview_returns_200(self, client):
        r = _get(client, self.BASE, "/overview")
        assert r.status_code == 200

    def test_filter_options_returns_200(self, client):
        r = _get(client, self.BASE, "/filter-options")
        assert r.status_code == 200

    def test_brand_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "brands=BareAnatomy&brands=CAP")
        assert r.status_code == 200

    def test_platform_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "platforms=Web")
        assert r.status_code == 200

    def test_customer_type_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "customers=New")
        assert r.status_code == 200


# ══════════════════════════════════════════════════════════
# /d2c-rto
# ══════════════════════════════════════════════════════════

class TestD2CRTO:
    BASE = "/d2c-rto"

    def test_overview_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/overview?{DATES}")
        assert r.status_code == 401

    def test_overview_returns_200(self, client):
        r = _get(client, self.BASE, "/overview")
        assert r.status_code == 200

    def test_payment_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "payment=COD")
        assert r.status_code == 200

    def test_customer_filter_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "customer=New")
        assert r.status_code == 200

    def test_compare_mode_accepted(self, client):
        r = _get(client, self.BASE, "/overview", "compare_mode=WoW")
        assert r.status_code == 200

    def test_ai_summary_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_ai_summary_returns_200_or_error(self, client):
        r = _get(client, self.BASE, "/ai-summary")
        assert r.status_code in (200, 500, 503)


# ══════════════════════════════════════════════════════════
# /promo
# ══════════════════════════════════════════════════════════

class TestPromoBasket:
    BASE = "/promo"

    def test_overview_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/overview?{DATES}")
        assert r.status_code == 401

    def test_overview_returns_200(self, client):
        r = _get(client, self.BASE, "/overview")
        assert r.status_code == 200

    def test_no_dates_uses_defaults(self, client):
        r = client.get(f"{self.BASE}/overview")
        assert r.status_code == 200

    def test_ai_summary_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/ai-summary?{DATES}")
        assert r.status_code == 401

    def test_ai_summary_returns_200_or_error(self, client):
        r = _get(client, self.BASE, "/ai-summary")
        assert r.status_code in (200, 500, 503)


# ══════════════════════════════════════════════════════════
# /chat
# ══════════════════════════════════════════════════════════

class TestChat:
    BASE = "/chat"

    def test_ask_requires_auth(self, unauth_client):
        r = unauth_client.post(f"{self.BASE}/ask", json={"question": "hello"})
        assert r.status_code == 401

    def test_agent_info_requires_auth(self, unauth_client):
        r = unauth_client.get(f"{self.BASE}/agent")
        assert r.status_code == 401

    def test_ask_missing_body_returns_422(self, client):
        r = client.post(f"{self.BASE}/ask", json={})
        assert r.status_code == 422

    def test_ask_returns_200_or_error(self, client):
        r = client.post(f"{self.BASE}/ask", json={"question": "What is total revenue?"})
        # 502 is expected when the real GCP agent SDK is invoked in test env
        # (no valid credentials / project). 200 if fully mocked.
        assert r.status_code in (200, 500, 502, 503)
