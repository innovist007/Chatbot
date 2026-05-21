"""Unit tests for AuthService (app/services/auth_service.py)."""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from jose import jwt

from app.config import Settings
from app.services.auth_service import AuthService

TEST_SECRET = "test-secret-key-for-tests-only-32chars!!"
TEST_DOMAIN = "onestolabs.com"


@pytest.fixture
def settings():
    return Settings(
        gcp_project_id="test-project",
        agent_id="test-agent",
        google_client_id="test-client-id",
        google_client_secret="test-secret",
        jwt_secret_key=TEST_SECRET,
        jwt_algorithm="HS256",
        jwt_expire_hours=24,
        allowed_email_domain=TEST_DOMAIN,
    )


@pytest.fixture
def svc(settings):
    return AuthService(settings)


@pytest.fixture
def user_data():
    return {
        "email": "alice@onestolabs.com",
        "name": "Alice Smith",
        "picture": "https://example.com/pic.jpg",
        "google_id": "123456",
        "email_verified": True,
    }


# ── create_access_token ────────────────────────────────────────────────────

class TestCreateAccessToken:
    def test_returns_string(self, svc, user_data):
        token = svc.create_access_token(user_data)
        assert isinstance(token, str)

    def test_payload_contains_email(self, svc, user_data):
        token = svc.create_access_token(user_data)
        payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["email"] == user_data["email"]

    def test_payload_contains_name(self, svc, user_data):
        token = svc.create_access_token(user_data)
        payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["name"] == user_data["name"]

    def test_token_not_expired(self, svc, user_data):
        token = svc.create_access_token(user_data)
        payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert exp > datetime.now(timezone.utc)

    def test_expiry_roughly_24h(self, svc, user_data):
        token = svc.create_access_token(user_data)
        payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(hours=23) < delta < timedelta(hours=25)

    def test_missing_name_defaults_empty(self, svc):
        token = svc.create_access_token({"email": "x@onestolabs.com"})
        payload = jwt.decode(token, TEST_SECRET, algorithms=["HS256"])
        assert payload["name"] == ""


# ── verify_access_token ────────────────────────────────────────────────────

class TestVerifyAccessToken:
    def test_valid_token_returns_payload(self, svc, user_data):
        token = svc.create_access_token(user_data)
        payload = svc.verify_access_token(token)
        assert payload["email"] == user_data["email"]

    def test_expired_token_raises_401(self, svc, user_data):
        expired = jwt.encode(
            {
                "sub": user_data["email"],
                "email": user_data["email"],
                "exp": datetime.now(timezone.utc) - timedelta(hours=1),
            },
            TEST_SECRET,
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc_info:
            svc.verify_access_token(expired)
        assert exc_info.value.status_code == 401

    def test_wrong_secret_raises_401(self, svc, user_data):
        bad_token = jwt.encode(
            {"email": user_data["email"], "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc_info:
            svc.verify_access_token(bad_token)
        assert exc_info.value.status_code == 401

    def test_garbage_string_raises_401(self, svc):
        with pytest.raises(HTTPException) as exc_info:
            svc.verify_access_token("not-a-token")
        assert exc_info.value.status_code == 401

    def test_token_missing_email_raises_401(self, svc):
        no_email_token = jwt.encode(
            {"sub": "someone", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            TEST_SECRET,
            algorithm="HS256",
        )
        with pytest.raises(HTTPException) as exc_info:
            svc.verify_access_token(no_email_token)
        assert exc_info.value.status_code == 401


# ── verify_google_token ────────────────────────────────────────────────────

class TestVerifyGoogleToken:
    def test_wrong_domain_raises_403(self, svc):
        fake_idinfo = {
            "email": "user@gmail.com",
            "name": "External User",
            "picture": "",
            "sub": "ext123",
            "email_verified": True,
        }
        with patch("app.services.auth_service.id_token.verify_oauth2_token", return_value=fake_idinfo):
            with pytest.raises(HTTPException) as exc_info:
                svc.verify_google_token("some-google-token")
            assert exc_info.value.status_code == 403

    def test_valid_domain_returns_user_data(self, svc):
        fake_idinfo = {
            "email": "alice@onestolabs.com",
            "name": "Alice",
            "picture": "https://pic.example.com",
            "sub": "gid123",
            "email_verified": True,
        }
        with patch("app.services.auth_service.id_token.verify_oauth2_token", return_value=fake_idinfo):
            result = svc.verify_google_token("valid-google-token")
        assert result["email"] == "alice@onestolabs.com"
        assert result["name"] == "Alice"

    def test_invalid_token_raises_401(self, svc):
        with patch(
            "app.services.auth_service.id_token.verify_oauth2_token",
            side_effect=ValueError("bad token"),
        ):
            with pytest.raises(HTTPException) as exc_info:
                svc.verify_google_token("bad-token")
            assert exc_info.value.status_code == 401

    def test_missing_email_raises_401(self, svc):
        with patch(
            "app.services.auth_service.id_token.verify_oauth2_token",
            return_value={"sub": "123"},  # no email key
        ):
            with pytest.raises(HTTPException) as exc_info:
                svc.verify_google_token("token")
            assert exc_info.value.status_code == 401
