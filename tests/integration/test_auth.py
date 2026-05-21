"""Integration tests for /auth/* endpoints."""
import json
from unittest.mock import patch

import fakeredis
import pytest


# ── /auth/logout ───────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_returns_200(self, client):
        r = client.post("/auth/logout")
        assert r.status_code == 200

    def test_logout_message(self, client):
        r = client.post("/auth/logout")
        assert "message" in r.json()


# ── /auth/me ───────────────────────────────────────────────────────────────

class TestGetMe:
    def test_authenticated_returns_200(self, client):
        """client fixture has get_current_user overridden — always auth'd."""
        r = client.get("/auth/me")
        assert r.status_code == 200

    def test_returns_email(self, client):
        r = client.get("/auth/me")
        body = r.json()
        assert body["email"] == "test@onestolabs.com"

    def test_unauthenticated_returns_401(self, unauth_client):
        r = unauth_client.get("/auth/me")
        assert r.status_code == 401

    def test_wrong_token_returns_401(self, unauth_client):
        r = unauth_client.get("/auth/me", headers={"Authorization": "Bearer garbage"})
        assert r.status_code == 401

    def test_expired_token_returns_401(self, unauth_client, expired_headers):
        r = unauth_client.get("/auth/me", headers=expired_headers)
        assert r.status_code == 401

    def test_missing_bearer_prefix_returns_403(self, unauth_client, auth_headers):
        bad = {"Authorization": auth_headers["Authorization"].replace("Bearer ", "")}
        r = unauth_client.get("/auth/me", headers=bad)
        assert r.status_code in (401, 403)


# ── /auth/google ───────────────────────────────────────────────────────────

class TestGoogleLogin:
    def _post(self, client, credential: str = "fake-token"):
        return client.post("/auth/google", json={"credential": credential})

    def test_invalid_google_token_returns_401(self, unauth_client):
        with patch(
            "app.services.auth_service.id_token.verify_oauth2_token",
            side_effect=ValueError("bad token"),
        ):
            fake_redis = fakeredis.FakeRedis(decode_responses=True)
            with patch("redis.Redis", return_value=fake_redis):
                r = self._post(unauth_client)
        assert r.status_code == 401

    def test_wrong_domain_returns_403(self, unauth_client):
        fake_idinfo = {"email": "user@gmail.com", "name": "Ext", "picture": "", "sub": "x"}
        with patch(
            "app.services.auth_service.id_token.verify_oauth2_token",
            return_value=fake_idinfo,
        ):
            fake_redis = fakeredis.FakeRedis(decode_responses=True)
            with patch("redis.Redis", return_value=fake_redis):
                r = self._post(unauth_client)
        assert r.status_code == 403

    def test_valid_token_triggers_otp_and_returns_session(self, unauth_client):
        fake_idinfo = {
            "email": "alice@onestolabs.com",
            "name": "Alice",
            "picture": "",
            "sub": "gid",
            "email_verified": True,
        }
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        with (
            patch("app.services.auth_service.id_token.verify_oauth2_token", return_value=fake_idinfo),
            patch("redis.Redis", return_value=fake_redis),
            patch("smtplib.SMTP") as mock_smtp,
        ):
            mock_smtp.return_value.__enter__.return_value.sendmail = lambda *a: None
            r = self._post(unauth_client)
        assert r.status_code == 200
        body = r.json()
        assert "session_id" in body
        assert body["email"] == "alice@onestolabs.com"

    def test_missing_credential_field_returns_422(self, unauth_client):
        r = unauth_client.post("/auth/google", json={})
        assert r.status_code == 422


# ── /auth/verify-otp ───────────────────────────────────────────────────────

class TestVerifyOTP:
    def _setup_session(self, fake_redis, email="alice@onestolabs.com"):
        """Create an OTP session directly in fakeredis, return (sid, code)."""
        import uuid, secrets
        sid = uuid.uuid4().hex
        code = f"{secrets.randbelow(1_000_000):06d}"
        payload = {"user": {"email": email, "name": "Alice", "picture": ""}, "otp": code, "attempts": 0}
        fake_redis.setex(f"auth_otp:{sid}", 600, json.dumps(payload))
        return sid, code

    def test_wrong_otp_returns_400(self, unauth_client):
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        sid, _ = self._setup_session(fake_redis)
        with patch("redis.Redis", return_value=fake_redis):
            r = unauth_client.post("/auth/verify-otp", json={"session_id": sid, "otp": "000000"})
        assert r.status_code == 400

    def test_expired_session_returns_400(self, unauth_client):
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        with patch("redis.Redis", return_value=fake_redis):
            r = unauth_client.post(
                "/auth/verify-otp",
                json={"session_id": "nonexistent", "otp": "123456"},
            )
        assert r.status_code == 400

    def test_correct_otp_returns_jwt(self, unauth_client):
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        sid, code = self._setup_session(fake_redis)
        with patch("redis.Redis", return_value=fake_redis):
            r = unauth_client.post("/auth/verify-otp", json={"session_id": sid, "otp": code})
        assert r.status_code == 200
        body = r.json()
        assert "access_token" in body
        assert body["token_type"] == "bearer"
        assert body["user"]["email"] == "alice@onestolabs.com"

    def test_missing_fields_returns_422(self, unauth_client):
        r = unauth_client.post("/auth/verify-otp", json={"session_id": "x"})
        assert r.status_code == 422


# ── /auth/resend-otp ───────────────────────────────────────────────────────

class TestResendOTP:
    def test_valid_session_resend(self, unauth_client):
        import uuid, secrets, json as _json
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        sid = uuid.uuid4().hex
        payload = {
            "user": {"email": "alice@onestolabs.com", "name": "Alice", "picture": ""},
            "otp": "111111",
            "attempts": 0,
        }
        fake_redis.setex(f"auth_otp:{sid}", 600, _json.dumps(payload))

        with (
            patch("redis.Redis", return_value=fake_redis),
            patch("smtplib.SMTP") as mock_smtp,
        ):
            mock_smtp.return_value.__enter__.return_value.sendmail = lambda *a: None
            r = unauth_client.post("/auth/resend-otp", json={"session_id": sid})
        assert r.status_code == 200
        body = r.json()
        assert body["session_id"] == sid
        assert body["email"] == "alice@onestolabs.com"

    def test_invalid_session_returns_400(self, unauth_client):
        fake_redis = fakeredis.FakeRedis(decode_responses=True)
        with patch("redis.Redis", return_value=fake_redis):
            r = unauth_client.post("/auth/resend-otp", json={"session_id": "bad-sid"})
        assert r.status_code == 400

    def test_missing_session_id_returns_422(self, unauth_client):
        r = unauth_client.post("/auth/resend-otp", json={})
        assert r.status_code == 422
