"""OTP service - generate, email and verify one-time codes for email 2FA."""
import json
import logging
import secrets
import smtplib
import uuid
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import redis
from fastapi import HTTPException, status

from app.config import Settings

logger = logging.getLogger(__name__)

OTP_KEY_PREFIX = "auth_otp:"


class OTPService:
    """Generates, emails, and verifies email OTPs. Backed by Redis."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.redis_client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            decode_responses=True,
            socket_connect_timeout=2,
        )
        try:
            self.redis_client.ping()
            logger.info("OTP service: Redis connected")
        except Exception as e:
            logger.error(f"OTP service: Redis unavailable: {e}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="OTP service unavailable (Redis down)",
            ) from e

    # ---------- Helpers ----------
    def _key(self, session_id: str) -> str:
        return f"{OTP_KEY_PREFIX}{session_id}"

    def _generate_code(self) -> str:
        length = self.settings.otp_length
        upper = 10 ** length
        return f"{secrets.randbelow(upper):0{length}d}"

    # ---------- Public API ----------
    def create_session(self, user_data: dict[str, Any]) -> tuple[str, str]:
        """Create a new OTP session for `user_data` (already Google-verified).

        Returns (session_id, otp_code). Stores `{user, otp, attempts}` in
        Redis under `session_id` with TTL = otp_expire_minutes.
        """
        session_id = uuid.uuid4().hex
        otp_code = self._generate_code()

        payload = {
            "user": user_data,
            "otp": otp_code,
            "attempts": 0,
        }
        ttl_seconds = self.settings.otp_expire_minutes * 60
        self.redis_client.setex(self._key(session_id), ttl_seconds, json.dumps(payload))

        logger.info(f"OTP session created for {user_data.get('email')} (sid={session_id[:8]}...)")
        return session_id, otp_code

    def rotate_code(self, session_id: str) -> tuple[str, str]:
        """Generate a fresh OTP for an existing session (resend flow).

        Returns (otp_code, email). Resets attempts and TTL.
        """
        raw = self.redis_client.get(self._key(session_id))
        if raw is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP session expired or invalid",
            )
        payload = json.loads(raw)
        new_code = self._generate_code()
        payload["otp"] = new_code
        payload["attempts"] = 0
        ttl_seconds = self.settings.otp_expire_minutes * 60
        self.redis_client.setex(self._key(session_id), ttl_seconds, json.dumps(payload))
        return new_code, payload["user"]["email"]

    def verify(self, session_id: str, otp_code: str) -> dict[str, Any]:
        """Verify the submitted OTP for `session_id`.

        Returns the Google-verified `user_data` on success and deletes the
        session. Raises 400 on mismatch / expiry / too many attempts.
        """
        key = self._key(session_id)
        raw = self.redis_client.get(key)
        if raw is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OTP expired or session not found. Please sign in again.",
            )

        payload = json.loads(raw)
        attempts = payload.get("attempts", 0)
        if attempts >= self.settings.otp_max_attempts:
            self.redis_client.delete(key)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many invalid attempts. Please sign in again.",
            )

        if otp_code.strip() != payload["otp"]:
            payload["attempts"] = attempts + 1
            # Preserve remaining TTL on this key
            ttl = self.redis_client.ttl(key)
            if ttl and ttl > 0:
                self.redis_client.setex(key, ttl, json.dumps(payload))
            else:
                self.redis_client.delete(key)
            remaining = self.settings.otp_max_attempts - payload["attempts"]
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
            )

        # Success — consume the session
        self.redis_client.delete(key)
        return payload["user"]

    # ---------- Email transport ----------
    def send_email(self, to_email: str, otp_code: str, name: str = "") -> None:
        """Send the OTP code via SMTP. Raises 500 on transport failure."""
        if not self.settings.smtp_user or not self.settings.smtp_password:
            logger.error("SMTP credentials not configured")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Email service not configured",
            )

        subject = f"Your {self.settings.smtp_from_name} verification code"
        greeting = f"Hi {name.split()[0]}," if name else "Hi,"
        ttl_min = self.settings.otp_expire_minutes

        text_body = (
            f"{greeting}\n\n"
            f"Your verification code is: {otp_code}\n\n"
            f"This code expires in {ttl_min} minutes. "
            f"If you did not request this code, please ignore this email.\n\n"
            f"— {self.settings.smtp_from_name}"
        )
        html_body = f"""\
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;padding:24px;">
    <div style="max-width:480px;margin:auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb;">
      <h2 style="margin:0 0 8px;color:#111827;">Verification code</h2>
      <p style="color:#6b7280;margin:0 0 24px;">{greeting} use the code below to finish signing in.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;
                  background:#f3f4f6;padding:16px;border-radius:8px;color:#111827;">
        {otp_code}
      </div>
      <p style="color:#6b7280;font-size:13px;margin-top:24px;">
        This code expires in {ttl_min} minutes. If you did not request it, you can safely ignore this email.
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">— {self.settings.smtp_from_name}</p>
    </div>
  </body>
</html>"""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self.settings.smtp_from_name} <{self.settings.smtp_user}>"
        msg["To"] = to_email
        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        try:
            with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=15) as server:
                server.starttls()
                server.login(self.settings.smtp_user, self.settings.smtp_password)
                server.sendmail(self.settings.smtp_user, [to_email], msg.as_string())
            logger.info(f"OTP email sent to {to_email}")
        except Exception as e:
            logger.exception(f"Failed to send OTP email to {to_email}: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to send verification email",
            ) from e
