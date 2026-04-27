"""FastAPI dependency providers."""
from functools import lru_cache

from app.config import get_settings
from app.services.agent_service import AgentService


@lru_cache
def get_agent_service() -> AgentService:
    """Single shared AgentService for the app lifetime."""
    return AgentService(get_settings())