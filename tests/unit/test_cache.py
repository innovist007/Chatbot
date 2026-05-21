"""Unit tests for CacheHelper (app/core/cache.py)."""
import json
from unittest.mock import MagicMock, patch

import fakeredis
import pytest

from app.core.cache import CacheHelper


@pytest.fixture
def cache():
    """CacheHelper backed by fakeredis — no real Redis needed."""
    fake = fakeredis.FakeRedis(decode_responses=True)
    with patch("redis.Redis", return_value=fake):
        helper = CacheHelper(host="localhost", port=6379, db=0, default_ttl=60)
    return helper


@pytest.fixture
def dead_cache():
    """CacheHelper where Redis connection fails (disabled mode)."""
    with patch("redis.Redis") as mock_cls:
        mock_cls.return_value.ping.side_effect = ConnectionError("refused")
        helper = CacheHelper(host="bad-host", port=9999, db=0)
    return helper


# ── get ────────────────────────────────────────────────────────────────────

class TestGet:
    def test_miss_returns_none(self, cache):
        assert cache.get("missing-key") is None

    def test_hit_returns_deserialized_value(self, cache):
        cache._client.set("k", json.dumps({"x": 1}))
        assert cache.get("k") == {"x": 1}

    def test_hit_returns_list(self, cache):
        cache._client.set("k", json.dumps([1, 2, 3]))
        assert cache.get("k") == [1, 2, 3]

    def test_disabled_returns_none(self, dead_cache):
        assert dead_cache.get("anything") is None


# ── set ────────────────────────────────────────────────────────────────────

class TestSet:
    def test_stores_dict(self, cache):
        cache.set("d", {"a": 1})
        raw = cache._client.get("d")
        assert json.loads(raw) == {"a": 1}

    def test_uses_default_ttl(self, cache):
        cache.set("t", 42)
        ttl = cache._client.ttl("t")
        assert 0 < ttl <= 60

    def test_custom_ttl(self, cache):
        cache.set("t2", "val", ttl=120)
        ttl = cache._client.ttl("t2")
        assert 60 < ttl <= 120

    def test_disabled_does_not_raise(self, dead_cache):
        dead_cache.set("k", "v")  # should be silent no-op

    def test_non_serialisable_uses_str_fallback(self, cache):
        from datetime import date
        cache.set("date", date(2026, 1, 1))
        raw = cache._client.get("date")
        assert "2026-01-01" in raw


# ── delete ─────────────────────────────────────────────────────────────────

class TestDelete:
    def test_removes_key(self, cache):
        cache.set("del-me", 1)
        cache.delete("del-me")
        assert cache.get("del-me") is None

    def test_missing_key_silent(self, cache):
        cache.delete("never-existed")  # no error

    def test_disabled_silent(self, dead_cache):
        dead_cache.delete("k")  # no error


# ── get_or_fetch ───────────────────────────────────────────────────────────

class TestGetOrFetch:
    def test_cache_miss_calls_fetch_and_stores(self, cache):
        fetch = MagicMock(return_value={"data": 99})
        result = cache.get_or_fetch("new-key", fetch, ttl=30)
        assert result == {"data": 99}
        fetch.assert_called_once()
        assert cache.get("new-key") == {"data": 99}

    def test_cache_hit_skips_fetch(self, cache):
        cache.set("cached-key", {"cached": True})
        fetch = MagicMock()
        result = cache.get_or_fetch("cached-key", fetch)
        assert result == {"cached": True}
        fetch.assert_not_called()

    def test_disabled_always_calls_fetch(self, dead_cache):
        fetch = MagicMock(return_value=42)
        r1 = dead_cache.get_or_fetch("k", fetch)
        r2 = dead_cache.get_or_fetch("k", fetch)
        assert r1 == r2 == 42
        assert fetch.call_count == 2
