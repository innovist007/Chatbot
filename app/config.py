"""Application configuration loaded from environment variables / .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed settings pulled from the .env file or real env vars."""

    model_config = SettingsConfigDict(
        env_file=".env",
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