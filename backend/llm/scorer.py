
"""Claude-powered behavioral trust scorer with guardrails and safe fallback."""

import asyncio
import logging
import os
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


async def llm_score(window: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Score a chat window. Return None if scoring is unavailable or invalid."""

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        logger.warning("LLM scoring skipped: ANTHROPIC_API_KEY is not configured.")
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

    try:
        redacted = redact_window(window)
        safe_window = []

        for message in redacted:
            raw_text = message.get("text", "")
            safe_text = raw_text if isinstance(raw_text, str) else str(raw_text)

            if detect_injection(safe_text):
                logger.warning(
                    "Potential prompt injection detected in conversation text."
                )

            safe_window.append({
                "sender_id": message.get("sender_id", "UNKNOWN"),
                "text": wrap_untrusted_text(safe_text),
            })

        system_prompt, user_prompt = build_prompts(safe_window)

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

        return validated

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.warning("LLM scoring failed (%s).", type(exc).__name__)
        return None
