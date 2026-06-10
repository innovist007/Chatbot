"""Application configuration loaded from environment variables / .env files.

Environment selection:
  APP_ENV=local       → loads .env  +  .env.local       (default for dev)
  APP_ENV=production  → loads .env  +  .env.production  (used by Cloud Run)

In Cloud Run, env vars are injected directly so the .env files are optional
fallbacks — actual env vars always take precedence over file values.
"""
import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Determine which overlay file to load (local or production)
_APP_ENV = os.getenv("APP_ENV", "local")


class Settings(BaseSettings):
    """Typed settings — base .env first, then env-specific overlay."""

    model_config = SettingsConfigDict(
        # Later files override earlier ones; missing files are silently skipped
        env_file=(".env", f".env.{_APP_ENV}"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Google Cloud / agent
    gcp_project_id: str
    gcp_location: str = "global"
    agent_id: str
    billing_project_id: str | None = None

    # Server
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    log_level: str = "info"

    # Google OAuth
    google_client_id: str
    google_client_secret: str

    # JWT for session tokens
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 24

    # Domain restriction
    allowed_email_domain: str = "onestolabs.com"

    # Email OTP (2FA)
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "Innovist Analytics"
    smtp_from_email: str = ""   # display sender address; falls back to smtp_user if empty

    otp_length: int = 6
    otp_expire_minutes: int = 10
    otp_max_attempts: int = 5

    # Redis (OTP session store)
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str | None = None

    # AI summary cron (Cloud Scheduler)
    cron_secret_key: str = ""                    # set in production — protects /internal/warm-summaries
    summary_cron_schedule: str = "0 10 * * *"   # default: 10:00 AM IST daily

    # ---------- Derived helpers ----------
    @property
    def billing_project(self) -> str:
        return self.billing_project_id or self.gcp_project_id

    @property
    def agent_resource(self) -> str:
        return (
            f"projects/{self.gcp_project_id}"
            f"/locations/{self.gcp_location}"
            f"/dataAgents/{self.agent_id}"
        )

    @property
    def parent_resource(self) -> str:
        return f"projects/{self.billing_project}/locations/{self.gcp_location}"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance — import this anywhere."""
    return Settings()


# ── Cache utilities ───────────────────────────────────────────────────────────
import hashlib

# Bump to invalidate ALL Redis keys across the whole backend at once.
# Override via CACHE_VERSION env var — no redeploy needed.
import os as _os
CACHE_V = _os.environ.get("CACHE_VERSION", "v5")

# All analytics data is historical and immutable for a given date range + filters.
# 24 hours is safe for everything. Memory pressure is handled by allkeys-lru
# eviction on Redis — frequently used date ranges stay warm, old ones are dropped.
ANALYTICS_TTL = 86_400  # 24 hours


def make_cache_key(module: str, prefix: str, *parts: str) -> str:
    """
    Uniform Redis key format used by every module:
        {module}:{CACHE_V}:{prefix}:{md5_of_filter_parts[:12]}

    Args:
        module  – short module name (retention, webcr, meta, appcr, …)
        prefix  – per-query label   (overview, kpis, trend_day, …)
        *parts  – all filter field values that make this result unique
    """
    h = hashlib.md5("|".join(parts).encode()).hexdigest()[:12]
    return f"{module}:{CACHE_V}:{prefix}:{h}"


# ── AI-summary slot ───────────────────────────────────────────────────────────
from datetime import datetime as _datetime, timedelta as _timedelta, timezone as _timezone

IST = _timezone(_timedelta(hours=5, minutes=30))


def ai_summary_dates() -> tuple[str, str]:
    """Return ``(slot, data_date)`` for AI summaries, both in IST.

    slot      – today's date. The Redis cache-key slot
                ``<module>:ai_summary:<slot>``. This MUST be identical between
                the warm-summaries cron and every on-demand endpoint — if they
                differ, a user request never hits the pre-warmed key and the
                agent regenerates the summary live on their request.
    data_date – yesterday's date: the latest complete data the summary
                describes and the date shown on the card.

    Single source of truth so the two sides can never drift apart again.
    """
    today = _datetime.now(IST).date()
    return today.isoformat(), (today - _timedelta(days=1)).isoformat()
