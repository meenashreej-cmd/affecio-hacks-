"""Redact personal information before sending chat to an LLM."""

import re
from typing import Any


EMAIL_RE = re.compile(
    r"\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+"
    r"(?:\.[A-Z0-9-]+)+\b",
    re.IGNORECASE,
)

URL_RE = re.compile(
    r"\b(?:https?://|www\.)[^\s<>]+",
    re.IGNORECASE,
)

# Supports international prefixes, spaces, dots, brackets and hyphens.
PHONE_RE = re.compile(
    r"(?<!\w)(?:\+\d{1,3}[\s.-]*)?"
    r"(?:\(?\d{2,5}\)?[\s.-]*)?"
    r"\d[\d\s().-]{5,}\d(?!\w)"
)

HANDLE_RE = re.compile(
    r"(?<![\w.+-])@[A-Z0-9_](?:[A-Z0-9_.]{0,28}[A-Z0-9_])?",
    re.IGNORECASE,
)


def redact_text(
    text: str,
    names: dict[str, str] | None = None,
) -> str:
    """Redact emails, URLs, phone numbers, handles and known names."""
    if not isinstance(text, str):
        return ""

    # Redact email first so its @ is not treated as a social handle.
    text = EMAIL_RE.sub("[EMAIL]", text)
    text = URL_RE.sub("[URL]", text)
    text = PHONE_RE.sub("[PHONE]", text)
    text = HANDLE_RE.sub("[HANDLE]", text)

    # Replace known names longest-first to handle overlapping names.
    for name, replacement in sorted(
        (names or {}).items(),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        if not name:
            continue

        text = re.sub(
            rf"(?<!\w){re.escape(name)}(?!\w)",
            lambda _: replacement,
            text,
            flags=re.IGNORECASE,
        )

    return text


def redact_window(
    window: list[dict[str, Any]],
    names: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """Return a sanitized copy of a conversation window."""
    sender_labels: dict[Any, str] = {}
    sanitized: list[dict[str, Any]] = []

    for message in window:
        item = dict(message)
        sender_id = item.get("sender_id")

        if sender_id is not None:
            if sender_id not in sender_labels:
                label = (
                    "SENDER_A" if not sender_labels else
                    "SENDER_B" if len(sender_labels) == 1 else
                    f"SENDER_{len(sender_labels) + 1}"
                )
                sender_labels[sender_id] = label

            item["sender_id"] = sender_labels[sender_id]

        if "text" in item:
            item["text"] = redact_text(item["text"], names)

        sanitized.append(item)

    return sanitized
