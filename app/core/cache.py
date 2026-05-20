"""CacheHelper — unified Redis get/set with graceful fallback."""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

import redis

logger = logging.getLogger(__name__)

_SENTINEL = object()


class CacheHelper:
    """
    Wraps Redis with:
    - Auto JSON serialization / deserialization
    - Graceful fallback when Redis is unavailable (no crash)
    - get_or_fetch() for the common cache-aside pattern
    """

    def __init__(
        self,
        host: str,
        port: int,
        db: int = 0,
        default_ttl: int = 3600,
    ) -> None:
        self._ttl = default_ttl
        self._client: redis.Redis | None = None
        try:
            client = redis.Redis(
                host=host, port=port, db=db,
                socket_connect_timeout=2,
                socket_timeout=2,
                decode_responses=True,
            )
            client.ping()
            self._client = client
            logger.debug("Redis connected %s:%s db=%s", host, port, db)
        except Exception as exc:
            logger.warning("Redis unavailable (%s) — caching disabled", exc)

    # ------------------------------------------------------------------ public

    def get(self, key: str) -> Any:
        """Return deserialized value or None on miss / error."""
        if self._client is None:
            return None
        try:
            raw = self._client.get(key)
            return json.loads(raw) if raw is not None else None
        except Exception:
            return None

    def set(self, key: str, value: Any, ttl: int | None = None) -> None:
        """Serialize and store value. Silently swallows errors."""
        if self._client is None:
            return
        try:
            self._client.setex(
                key,
                ttl if ttl is not None else self._ttl,
                json.dumps(value, default=str),
            )
        except Exception:
            pass

    def get_or_fetch(
        self,
        key: str,
        fetch_fn: Callable[[], Any],
        ttl: int | None = None,
    ) -> Any:
        """
        Return cached value if fresh; otherwise call fetch_fn(),
        cache the result, and return it.
        """
        cached = self.get(key)
        if cached is not None:
            return cached
        result = fetch_fn()
        self.set(key, result, ttl)
        return result

    def delete(self, key: str) -> None:
        if self._client is None:
            return
        try:
            self._client.delete(key)
        except Exception:
            pass
