"""Shared fixtures for all tests.

Sets required environment variables BEFORE any app import so that
pydantic-settings and the lru_cache on get_settings() both see test values.
BigQuery and the agent SDK are mocked at session scope so no real GCP
credentials are needed.
"""
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from jose import jwt

# ── Must happen before any app import ──────────────────────────────────────
TEST_JWT_SECRET = "test-secret-key-for-tests-only-32chars!!"
TEST_DOMAIN = "onestolabs.com"
TEST_EMAIL = "test@onestolabs.com"

os.environ.update(
    {
        "GCP_PROJECT_ID": "test-project",
        "GCP_LOCATION": "global",
        "AGENT_ID": "test-agent",
        "GOOGLE_CLIENT_ID": "test-google-client-id",
        "GOOGLE_CLIENT_SECRET": "test-google-secret",
        "JWT_SECRET_KEY": TEST_JWT_SECRET,
        "JWT_ALGORITHM": "HS256",
        "JWT_EXPIRE_HOURS": "24",
        "ALLOWED_EMAIL_DOMAIN": TEST_DOMAIN,
        "SMTP_USER": "test@onestolabs.com",
        "SMTP_PASSWORD": "test-smtp-password",
        "SMTP_HOST": "smtp.gmail.com",
        "SMTP_PORT": "587",
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "REDIS_DB": "0",
    }
)

# Clear cached settings so test env vars are picked up
from app.config import get_settings
get_settings.cache_clear()

# ── App + dependency imports (after env setup) ─────────────────────────────
from app.main import app
from app.routers.auth import get_current_user


# ── Helpers ────────────────────────────────────────────────────────────────

def make_token(email: str = TEST_EMAIL, expired: bool = False) -> str:
    """Create a signed JWT for testing."""
    delta = timedelta(hours=-1) if expired else timedelta(hours=24)
    payload = {
        "sub": email,
        "email": email,
        "name": "Test User",
        "picture": "",
        "exp": datetime.now(timezone.utc) + delta,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, TEST_JWT_SECRET, algorithm="HS256")


def _mock_user() -> dict:
    return {
        "sub": TEST_EMAIL,
        "email": TEST_EMAIL,
        "name": "Test User",
        "picture": "",
    }


# ── Session-scoped BigQuery patch ──────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def mock_bigquery():
    """Replace bigquery.Client globally for the entire test session.

    Services create their BQ client in __init__ via BaseService.
    By patching at session scope we ensure every service singleton
    created through the lru_cache router helpers uses the mock.
    """
    with patch("google.cloud.bigquery.Client") as mock_cls:
        mock_instance = MagicMock()
        # _query() does: [dict(row.items()) for row in bq.query(sql).result()]
        # Returning [] means all queries yield empty result sets.
        mock_instance.query.return_value.result.return_value = []
        mock_cls.return_value = mock_instance
        yield mock_instance


@pytest.fixture(scope="session", autouse=True)
def mock_agent_sdk():
    """Stub out the Gemini data-analytics SDK so no GCP calls are made."""
    with patch(
        "google.cloud.geminidataanalytics.DataAgentServiceClient"
    ) as mock_cls:
        mock_cls.return_value = MagicMock()
        yield mock_cls


# ── Test client fixtures ───────────────────────────────────────────────────

@pytest.fixture(scope="session")
def client(mock_bigquery, mock_agent_sdk):
    """Authenticated test client.

    Overrides get_current_user so every request is treated as authenticated
    without needing a real JWT round-trip. Override persists for the session
    so all tests using this fixture are pre-authenticated.
    """
    app.dependency_overrides[get_current_user] = _mock_user
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def unauth_client(mock_bigquery, mock_agent_sdk):
    """Unauthenticated test client.

    Temporarily removes the get_current_user override (if set by the session-
    scoped `client` fixture) so auth checks run for real. Restores it after.
    """
    saved = app.dependency_overrides.pop(get_current_user, None)
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    if saved is not None:
        app.dependency_overrides[get_current_user] = saved


@pytest.fixture(scope="session")
def auth_headers():
    """Bearer token headers using a real signed JWT (tests the full auth path)."""
    return {"Authorization": f"Bearer {make_token()}"}


@pytest.fixture(scope="session")
def expired_headers():
    return {"Authorization": f"Bearer {make_token(expired=True)}"}


# ── BQ row factory ─────────────────────────────────────────────────────────

def make_bq_rows(rows: list[dict]) -> list[MagicMock]:
    """Convert plain dicts into mock BQ row objects with .items()."""
    result = []
    for row in rows:
        m = MagicMock()
        m.items.return_value = row.items()
        result.append(m)
    return result


@pytest.fixture
def configure_bq(mock_bigquery):
    """Per-test helper: configure what rows _query() returns.

    Usage:
        def test_foo(configure_bq):
            configure_bq([{"col": "val"}])
    """
    def _set(rows: list[dict]):
        mock_bigquery.query.return_value.result.return_value = make_bq_rows(rows)

    yield _set
    # Reset to empty after each test
    mock_bigquery.query.return_value.result.return_value = []
