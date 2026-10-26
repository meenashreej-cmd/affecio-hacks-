
import time

from backend.llm import scorer


def setup_function():
    """Keep cache tests independent."""
    scorer._score_cache.clear()


def test_cache_hit_returns_stored_result():
    key = "test-key"
    result = {"score": 75, "reason": "test"}

    scorer._cache_set(key, result)

    assert scorer._cache_get(key) == result


def test_cache_miss_returns_none():
    assert scorer._cache_get("missing-key") is None


def test_expired_entry_is_removed(monkeypatch):
    key = "expired-key"
    result = {"score": 40}

    scorer._cache_set(key, result)

    # Move the expiry time into the past.
    scorer._score_cache[key] = (time.monotonic() - 1, result)

    assert scorer._cache_get(key) is None
    assert key not in scorer._score_cache


def test_cache_returns_a_copy():
    key = "copy-key"
    result = {"score": 60, "details": {"reason": "test"}}

    scorer._cache_set(key, result)
    retrieved = scorer._cache_get(key)

    assert retrieved == result
    assert retrieved is not result


def test_cache_evicts_oldest_entry_when_full(monkeypatch):
    monkeypatch.setattr(scorer, "CACHE_MAX_ENTRIES", 2)

    scorer._cache_set("first", {"score": 10})
    scorer._cache_set("second", {"score": 20})
    scorer._cache_set("third", {"score": 30})

    assert len(scorer._score_cache) == 2
    assert "first" not in scorer._score_cache
    assert scorer._cache_get("second") == {"score": 20}
    assert scorer._cache_get("third") == {"score": 30}


def test_cache_key_is_repeatable_and_changes_with_input():
    key_one = scorer._cache_key("model", "system", "user")
    key_two = scorer._cache_key("model", "system", "user")
    key_three = scorer._cache_key("model", "system", "different user")

    assert key_one == key_two
    assert key_one != key_three


def test_cache_key_does_not_expose_api_key():
    secret = "example-secret-key"

    key = scorer._cache_key("model", "system", "user", secret)

    assert secret not in key
    assert len(key) == 64


import asyncio
import json
from types import SimpleNamespace

import pytest


@pytest.mark.asyncio
async def test_llm_score_reuses_cached_result(monkeypatch):
    """Identical scoring inputs should call the Claude API only once."""
    scorer._score_cache.clear()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-api-key")
    monkeypatch.setenv("LLM_MODEL", "test-model")

    calls = 0

    class FakeMessages:
        async def create(self, **kwargs):
            nonlocal calls
            calls += 1
            return SimpleNamespace(
                content=[
                    SimpleNamespace(
                        type="text",
                        text=json.dumps({
                            "score": 50,
                            "reason": "test result",
                        }),
                    )
                ],
                usage=SimpleNamespace(
                    input_tokens=10,
                    output_tokens=10,
                ),
            )

    class FakeClient:
        def __init__(self, **kwargs):
            self.messages = FakeMessages()

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

    monkeypatch.setattr(scorer, "AsyncAnthropic", FakeClient)
    monkeypatch.setattr(
        scorer,
        "validate_scorer_output",
        lambda raw: json.loads(raw),
    )

    window = [{"sender_id": "user1", "text": "Hello"}]

    first = await scorer.llm_score(window)
    second = await scorer.llm_score(window)

    assert first == second
    assert calls == 1
