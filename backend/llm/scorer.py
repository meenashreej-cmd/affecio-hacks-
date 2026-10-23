import asyncio
import os
from typing import Any
from dotenv import load_dotenv

load_dotenv()


async def llm_score(window: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    Evaluates conversational window using an LLM behavioral scorer.
    STUB CONTRACT:
    Teammates will replace this body later.
    Returns:
        {
            "risk_score": int,
            "scam_type": "romance" | "phishing" | "impersonation" | "sextortion" | "none",
            "signals": [{"label": str, "evidence": str}],
            "confidence": float,
            "recommended_action": "allow" | "warn" | "restrict_media" | "block",
        }
    """
    sleep_seconds = float(os.getenv("LLM_SLEEP_SECONDS", "1"))
    if sleep_seconds > 0:
        await asyncio.sleep(sleep_seconds)

    mentions_suspicious = False
    for msg in window:
        text = str(msg.get("text", "")).lower()
        if "money" in text or "gift card" in text or "whatsapp" in text:
            mentions_suspicious = True
            break

    if mentions_suspicious:
        return {
            "risk_score": 80,
            "scam_type": "romance",
            "signals": [
                {
                    "label": "financial_solicitation",
                    "evidence": "Conversation mentions money, gift cards, or external platform (whatsapp)",
                }
            ],
            "confidence": 0.90,
            "recommended_action": "restrict_media",
        }

    return {
        "risk_score": 15,
        "scam_type": "none",
        "signals": [
            {
                "label": "benign_chat",
                "evidence": "Standard friendly conversation flow without financial or off-platform coercion",
            }
        ],
        "confidence": 0.95,
        "recommended_action": "allow",
    }
