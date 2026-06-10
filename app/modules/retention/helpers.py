from __future__ import annotations

import logging
from datetime import date, timedelta

from fastapi import HTTPException

from app.modules.retention.filters import RetentionFilters

logger = logging.getLogger(__name__)

VALID_WINDOWS     = {"7d", "14d", "30d", "60d", "90d", "120d", "180d", "360d"}
VALID_SEGMENTS    = {"brand", "product", "channel", "discount", "payment", "platform"}
VALID_GRANULARITY = {"DoD", "WoW", "MoM", "YoY"}


def build_filters(
    start_date: date | None,
    end_date:   date | None,
    brands:     list[str] | None,
    default_days: int = 90,
) -> RetentionFilters:
    today = date.today()
    end   = end_date   or today
    start = start_date or (end - timedelta(days=default_days))
    if start > end:
        raise HTTPException(400, "start_date must be ≤ end_date")
    return RetentionFilters(start_date=start, end_date=end, brands=brands or None)


def bad_gateway(exc: Exception, label: str) -> None:
    logger.exception("%s failed", label)
    raise HTTPException(502, detail=str(exc)) from exc
