
"""Claude-powered behavioral trust scorer with guardrails, caching, and safe fallback."""

import asyncio
import hashlib
import json
import logging
import os
import time
from collections import OrderedDict
from typing import Any

from anthropic import AsyncAnthropic
from dotenv import load_dotenv

from backend.llm.guard import (
    detect_injection,
    validate_scorer_output,
    wrap_untrusted_text,
)
from backend.llm.prompt import build_prompts
from backend.llm.redact import redact_window

load_dotenv()
logger = logging.getLogger(__name__)

# Cache configuration
CACHE_TTL_SECONDS = 60
CACHE_MAX_ENTRIES = 256

# Maps a hash of the scoring inputs to (expiry timestamp, validated result).
# Cache is process-local and is never written to disk.
_score_cache: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()


def _cache_key(
    model: str,
    system_prompt: str,
    user_prompt: str,
    api_key: str = "",
) -> str:
    """Hash scoring inputs without storing prompts or API keys in the cache key."""
    payload = json.dumps(
        [
            model,
            system_prompt,
            user_prompt,
            hashlib.sha256(api_key.encode("utf-8")).hexdigest(),
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> dict[str, Any] | None:
    """Return a fresh cached result, removing expired entries."""
    entry = _score_cache.get(key)
    if entry is None:
        return None

    expires_at, result = entry

    if time.monotonic() >= expires_at:
        _score_cache.pop(key, None)
        return None

    # Refresh LRU order without extending the TTL.
    _score_cache.move_to_end(key)
    return dict(result)


def _cache_set(key: str, result: dict[str, Any]) -> None:
    """Store a validated result with a TTL and a bounded entry count."""
    _score_cache[key] = (
        time.monotonic() + CACHE_TTL_SECONDS,
        dict(result),
    )
    _score_cache.move_to_end(key)

    # Evict least-recently-used entries when the cache reaches its limit.
    while len(_score_cache) > CACHE_MAX_ENTRIES:
        _score_cache.popitem(last=False)


async def llm_score(window: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Score a chat window with guardrails, caching, and safe fallback."""

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        logger.warning("LLM scoring skipped: API key is not configured.")
        return None

    model = os.getenv("LLM_MODEL", "claude-3-haiku-20240307").strip()
    if not model:
        logger.warning("LLM scoring skipped: LLM_MODEL is empty.")
        return None

    try:
        configured_timeout = float(os.getenv("LLM_TIMEOUT_SECONDS", "8"))
        if not 0 < configured_timeout < float("inf"):
            raise ValueError("Timeout must be positive and finite.")
    except (TypeError, ValueError):
        logger.warning("Invalid LLM_TIMEOUT_SECONDS configuration.")
        return None

    request_timeout = max(0.1, configured_timeout - 0.5)
    started = time.perf_counter()

    try:
        # Redact sensitive values before preparing prompts or cache keys.
        redacted = redact_window(window)
        safe_window = []

        for message in redacted:
            raw_text = message.get("text", "")
            safe_text = (
                raw_text if isinstance(raw_text, str) else str(raw_text)
            )

            if detect_injection(safe_text):
                logger.warning("Potential prompt injection pattern detected.")

            safe_window.append(
                {
                    "sender_id": message.get("sender_id", "UNKNOWN"),
                    "text": wrap_untrusted_text(safe_text),
                }
            )

        system_prompt, user_prompt = build_prompts(safe_window)

        # Cache only the validated scorer output. The raw prompts and API key
        # are not stored in the cache.
        key = _cache_key(model, system_prompt, user_prompt, api_key)
        cached_result = _cache_get(key)

        if cached_result is not None:
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.info(
                "LLM scoring cache hit model=%s latency_ms=%.1f",
                model,
                elapsed_ms,
            )
            return cached_result

        async with AsyncAnthropic(
            api_key=api_key,
            timeout=request_timeout,
            max_retries=0,
        ) as client:
            response = await asyncio.wait_for(
                client.messages.create(
                    model=model,
                    max_tokens=700,
                    system=system_prompt,
                    messages=[{"role": "user", "content": user_prompt}],
                ),
                timeout=request_timeout,
            )

        elapsed_ms = (time.perf_counter() - started) * 1000
        usage = getattr(response, "usage", None)
        input_tokens = getattr(usage, "input_tokens", None)
        output_tokens = getattr(usage, "output_tokens", None)

        logger.info(
            "LLM request completed model=%s cache_hit=false latency_ms=%.1f "
            "input_tokens=%s output_tokens=%s",
            model,
            elapsed_ms,
            input_tokens if input_tokens is not None else "unavailable",
            output_tokens if output_tokens is not None else "unavailable",
        )

        text_blocks = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text"
            and isinstance(getattr(block, "text", None), str)
        ]

        if not text_blocks:
            logger.warning("LLM returned no text content.")
            return None

        validated = validate_scorer_output(text_blocks[0])
        if validated is None:
            logger.warning("LLM returned invalid scorer output.")
            return None

        # Invalid responses and failures are never cached.
        _cache_set(key, validated)
        return validated

    except asyncio.CancelledError:
        # Preserve task cancellation instead of swallowing it.
        raise
    except Exception as exc:
        elapsed_ms = (time.perf_counter() - started) * 1000
        logger.warning(
            "LLM scoring failed error_type=%s latency_ms=%.1f",
            type(exc).__name__,
            elapsed_ms,
        )
        return None
