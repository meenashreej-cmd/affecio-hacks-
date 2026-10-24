
"""Guardrails for untrusted conversation content and LLM scorer output."""

import base64
import re
from typing import Any

from backend.llm.schema import LLMResult


# Heuristic signals only: these do not prove an attack occurred.
INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(all\s+)?(previous|prior|above|earlier)\s+instructions", re.I),
    re.compile(r"\b(system|developer)\s*:", re.I),
    re.compile(r"\bact\s+as\s+(an?\s+)?(unrestricted|different|new)\b", re.I),
    re.compile(r"\b(roleplay|role-play)\b.{0,80}\b(unrestricted|no rules|no limits)\b", re.I),
    re.compile(r"\b(output|return|set)\b.{0,40}\brisk_score\b.{0,20}\b0\b", re.I),
    re.compile(r"<\s*/?\s*(system|developer|assistant)\s*>", re.I),
]


def detect_injection(text: str) -> list[str]:
    """Return labels for recognizable prompt-injection patterns."""
    if not isinstance(text, str):
        return []

    matches = [
        f"pattern_{index + 1}"
        for index, pattern in enumerate(INJECTION_PATTERNS)
        if pattern.search(text)
    ]

    # Inspect plausible base64 tokens for common instruction overrides.
    for token in re.findall(r"(?<!\w)[A-Za-z0-9+/]{20,}={0,2}(?!\w)", text):
        try:
            decoded = base64.b64decode(token, validate=True).decode(
                "utf-8", errors="ignore"
            )
        except (ValueError, base64.binascii.Error):
            continue

        if any(pattern.search(decoded) for pattern in INJECTION_PATTERNS):
            matches.append("encoded_instruction")
            break

    return sorted(set(matches))


def wrap_untrusted_text(text: str) -> str:
    """Wrap text as data; delimiters are not a security boundary by themselves."""
    safe_text = text.replace("<", "&lt;").replace(">", "&gt;")
    return (
        "UNTRUSTED_CONVERSATION_TEXT_START\n"
        f"{safe_text}\n"
        "UNTRUSTED_CONVERSATION_TEXT_END"
    )


def validate_scorer_output(payload: Any) -> dict[str, Any] | None:
    """Return normalized schema-valid output, or None for invalid output."""
    try:
        if isinstance(payload, str):
            result = LLMResult.model_validate_json(payload)
        else:
            result = LLMResult.model_validate(payload)
        return result.model_dump()
    except Exception:
        return None


def check_score_disagreement(
    llm_result: dict[str, Any], rule_score: int, minimum_rule_score: int = 60
) -> bool:
    """Flag a low LLM score against a high rule score for review."""
    try:
        llm_score = llm_result["risk_score"]
        return (
            isinstance(rule_score, int)
            and not isinstance(rule_score, bool)
            and rule_score >= minimum_rule_score
            and isinstance(llm_score, int)
            and not isinstance(llm_score, bool)
            and llm_score == 0
        )
    except (KeyError, TypeError):
        return False
