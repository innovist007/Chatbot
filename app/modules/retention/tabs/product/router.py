from __future__ import annotations

import asyncio
import logging
from datetime import date
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.modules.retention.helpers import VALID_WINDOWS, bad_gateway, build_filters
from app.modules.retention.tabs.product.service import ProductService

logger = logging.getLogger(__name__)
router = APIRouter()


@lru_cache
def _svc() -> ProductService:
    return ProductService(get_settings())


@router.get("/product-table", summary="Product × cohort_month repeat rate table")
async def product_table(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().product_table, f)
    except Exception as exc:
        bad_gateway(exc, "retention/product-table")


@router.get("/cross-sell", summary="FO→SO cross-sell waterfall with optional FO product filter")
async def cross_sell(
    start_date:  date | None      = Query(None),
    end_date:    date | None      = Query(None),
    brands:      list[str] | None = Query(None),
    window:      str              = Query("30d", description="7d|30d|60d|120d|360d"),
    fo_product:  str | None       = Query(None,  description="Filter to a specific first-order product"),
) -> list[dict[str, Any]]:
    if window not in VALID_WINDOWS:
        raise HTTPException(400, f"window must be one of {VALID_WINDOWS}")
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().cross_sell, f, window, fo_product)
    except Exception as exc:
        bad_gateway(exc, "retention/cross-sell")


@router.get("/fo-so-gap", summary="Median FO→SO gap days by first-order product")
async def fo_so_gap(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().fo_so_gap, f)
    except Exception as exc:
        bad_gateway(exc, "retention/fo-so-gap")


@router.get("/affinity-matrix", summary="Product co-purchase affinity — % of A-buyers who also bought B")
async def affinity_matrix(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().affinity_matrix, f)
    except Exception as exc:
        bad_gateway(exc, "retention/affinity-matrix")


@router.get("/return-rate", summary="Return/refund rate by product + gross vs net repeat rate")
async def return_rate(
    start_date: date | None      = Query(None),
    end_date:   date | None      = Query(None),
    brands:     list[str] | None = Query(None),
) -> list[dict[str, Any]]:
    f = build_filters(start_date, end_date, brands)
    try:
        return await asyncio.to_thread(_svc().return_rate, f)
    except Exception as exc:
        bad_gateway(exc, "retention/return-rate")
