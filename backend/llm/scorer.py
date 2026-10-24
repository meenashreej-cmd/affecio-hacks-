"""Claude-powered behavioral trust scorer with safe fallback."""

import asyncio
import logging
import os
from typing import Any

from anthropic import AsyncAnthropic
from dotenv import load_dotenv

from backend.llm.prompt import build_prompts
from backend.llm.redact import redact_window
from backend.llm.schema import LLMResult

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

    # Leave a little time for the caller's outer pipeline timeout.
    request_timeout = max(0.1, configured_timeout - 0.5)

    try:
        # Redact first, then send only the minimum required fields.
        redacted = redact_window(window)
        safe_window = [
            {
                "sender_id": message.get("sender_id", "UNKNOWN"),
                "text": message.get("text", ""),
            }
            for message in redacted
        ]

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
                    messages=[
                        {"role": "user", "content": user_prompt}
                    ],
                ),
                timeout=request_timeout,
            )

        # Only accept a text response; never trust it before validation.
        text_blocks = [
            block.text
            for block in response.content
            if getattr(block, "type", None) == "text"
            and isinstance(getattr(block, "text", None), str)
        ]
        if not text_blocks:
            logger.warning("LLM returned no text content.")
            return None

        # Validate the entire response as JSON against the strict schema.
        result = LLMResult.model_validate_json(text_blocks[0])
        return result.model_dump()

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Avoid logging chat content, credentials, or the raw model response.
        logger.warning("LLM scoring failed (%s).", type(exc).__name__)
        return None
