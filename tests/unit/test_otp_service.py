"""Unit tests for OTPService (app/services/otp_service.py)."""
import json
from unittest.mock import patch

import fakeredis
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.services.otp_service import OTPService


@pytest.fixture
def fake_redis():
    return fakeredis.FakeRedis(decode_responses=True)


@pytest.fixture
def svc(fake_redis):
    """OTPService wired to a fakeredis instance."""
    settings = Settings(
        gcp_project_id="test-project",
        agent_id="test-agent",
        google_client_id="test-client-id",
        google_client_secret="test-secret",
        jwt_secret_key="test-secret-key-for-tests-only-32chars!!",
        smtp_user="test@onestolabs.com",
        smtp_password="smtp-password",
        otp_length=6,
        otp_expire_minutes=10,
        otp_max_attempts=5,
    )
    with patch("redis.Redis", return_value=fake_redis):
        service = OTPService(settings)
    return service


@pytest.fixture
def user_data():
    return {
        "email": "alice@onestolabs.com",
        "name": "Alice Smith",
        "picture": "",
        "google_id": "gid-123",
    }


# ── create_session ─────────────────────────────────────────────────────────

class TestCreateSession:
    def test_returns_session_id_and_code(self, svc, user_data):
        sid, code = svc.create_session(user_data)
        assert sid and code

    def test_code_is_6_digits(self, svc, user_data):
        _, code = svc.create_session(user_data)
        assert code.isdigit()
        assert len(code) == 6

    def test_session_stored_in_redis(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        raw = fake_redis.get(f"auth_otp:{sid}")
        assert raw is not None
        payload = json.loads(raw)
        assert payload["user"]["email"] == user_data["email"]

    def test_session_has_zero_attempts(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        payload = json.loads(fake_redis.get(f"auth_otp:{sid}"))
        assert payload["attempts"] == 0

    def test_session_ttl_set(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        ttl = fake_redis.ttl(f"auth_otp:{sid}")
        assert 0 < ttl <= 600  # 10 minutes


# ── verify ─────────────────────────────────────────────────────────────────

class TestVerify:
    def test_correct_otp_returns_user(self, svc, user_data):
        sid, code = svc.create_session(user_data)
        result = svc.verify(sid, code)
        assert result["email"] == user_data["email"]

    def test_session_deleted_after_success(self, svc, fake_redis, user_data):
        sid, code = svc.create_session(user_data)
        svc.verify(sid, code)
        assert fake_redis.get(f"auth_otp:{sid}") is None

    def test_wrong_otp_raises_400(self, svc, user_data):
        sid, _ = svc.create_session(user_data)
        with pytest.raises(HTTPException) as exc_info:
            svc.verify(sid, "000000")
        assert exc_info.value.status_code == 400

    def test_wrong_otp_increments_attempts(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        try:
            svc.verify(sid, "000000")
        except HTTPException:
            pass
        payload = json.loads(fake_redis.get(f"auth_otp:{sid}"))
        assert payload["attempts"] == 1

    def test_max_attempts_locks_session(self, svc, user_data):
        sid, _ = svc.create_session(user_data)
        for _ in range(5):
            try:
                svc.verify(sid, "000000")
            except HTTPException:
                pass
        with pytest.raises(HTTPException) as exc_info:
            svc.verify(sid, "000000")
        assert exc_info.value.status_code == 400
        assert "Too many" in exc_info.value.detail

    def test_expired_session_raises_400(self, svc):
        with pytest.raises(HTTPException) as exc_info:
            svc.verify("nonexistent-session-id", "123456")
        assert exc_info.value.status_code == 400

    def test_otp_with_whitespace_stripped(self, svc, user_data):
        sid, code = svc.create_session(user_data)
        result = svc.verify(sid, f"  {code}  ")
        assert result["email"] == user_data["email"]


# ── rotate_code ────────────────────────────────────────────────────────────

class TestRotateCode:
    def test_returns_new_code_and_email(self, svc, user_data):
        sid, old_code = svc.create_session(user_data)
        new_code, email = svc.rotate_code(sid)
        assert email == user_data["email"]
        assert new_code.isdigit()

    def test_new_code_stored_in_redis(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        new_code, _ = svc.rotate_code(sid)
        payload = json.loads(fake_redis.get(f"auth_otp:{sid}"))
        assert payload["otp"] == new_code

    def test_attempts_reset_to_zero(self, svc, fake_redis, user_data):
        sid, _ = svc.create_session(user_data)
        # Burn some attempts
        for _ in range(2):
            try:
                svc.verify(sid, "000000")
            except HTTPException:
                pass
        svc.rotate_code(sid)
        payload = json.loads(fake_redis.get(f"auth_otp:{sid}"))
        assert payload["attempts"] == 0

    def test_invalid_session_raises_400(self, svc):
        with pytest.raises(HTTPException) as exc_info:
            svc.rotate_code("bad-session-id")
        assert exc_info.value.status_code == 400


# ── send_email ─────────────────────────────────────────────────────────────

class TestSendEmail:
    def test_missing_credentials_raises_500(self, fake_redis):
        settings = Settings(
            gcp_project_id="test-project",
            agent_id="test-agent",
            google_client_id="cid",
            google_client_secret="csec",
            jwt_secret_key="test-secret-key-for-tests-only-32chars!!",
            smtp_user="",       # empty — not configured
            smtp_password="",
        )
        with patch("redis.Redis", return_value=fake_redis):
            svc_no_smtp = OTPService(settings)
        with pytest.raises(HTTPException) as exc_info:
            svc_no_smtp.send_email("someone@onestolabs.com", "123456")
        assert exc_info.value.status_code == 500

    def test_smtp_failure_raises_500(self, svc):
        with patch("smtplib.SMTP", side_effect=OSError("connection refused")):
            with pytest.raises(HTTPException) as exc_info:
                svc.send_email("alice@onestolabs.com", "123456", "Alice")
            assert exc_info.value.status_code == 500

    def test_successful_send_calls_smtp(self, svc):
        with patch("smtplib.SMTP") as mock_smtp_cls:
            mock_server = mock_smtp_cls.return_value.__enter__.return_value
            svc.send_email("alice@onestolabs.com", "123456", "Alice")
            mock_server.sendmail.assert_called_once()
