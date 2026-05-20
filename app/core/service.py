"""BaseService — shared BigQuery client + CacheHelper for all analytics services."""
from __future__ import annotations

import asyncio
import logging
from functools import partial
from typing import Any, Callable

from google.cloud import bigquery

from app.config import Settings
from app.core.cache import CacheHelper

logger = logging.getLogger(__name__)


class BaseService:
    """
    Inherit from this in every analytics service.

    Provides:
    - self.bq       : BigQuery client
    - self.cache    : CacheHelper (Redis-backed, auto-fallback)
    - self._query() : run a BQ SQL string → list[dict]
    - self._run_async() : offload a sync call to the thread pool so it
                          doesn't block the FastAPI event loop
    """

    def __init__(self, settings: Settings, cache_prefix: str = "") -> None:
        self._prefix = cache_prefix
        self.bq = bigquery.Client(project=settings.gcp_project_id)
        self.cache = CacheHelper(
            host=settings.redis_host,
            port=settings.redis_port,
            db=getattr(settings, "redis_db", 0),
            default_ttl=getattr(settings, "redis_ttl", 3600),
        )

    # ------------------------------------------------------------------ BQ

    def _query(self, sql: str) -> list[dict[str, Any]]:
        """Execute a BigQuery query synchronously and return rows as dicts."""
        result = self.bq.query(sql).result()
        return [dict(row.items()) for row in result]

    # ------------------------------------------------------------------ async bridge

    async def _run_async(self, fn: Callable, *args, **kwargs) -> Any:
        """
        Run a synchronous service method in the default thread-pool executor
        so that blocking BQ / Redis calls don't stall the FastAPI event loop.

        Usage in a router:
            result = await svc._run_async(svc.get_overview, filters)
        """
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, partial(fn, *args, **kwargs))
