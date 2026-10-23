from typing import Any


def rule_score(window: list[dict[str, Any]], recipient: dict[str, Any]) -> dict[str, Any]:
    """
    Evaluates rule-based signals over the last message window (up to 12 messages).
    STUB CONTRACT:
    Teammates will replace this body later.
    Returns:
        {
            "score": int (0-100),
            "signals": [{"label": str, "evidence_msg_id": int}]
        }
    """
    for msg in window:
        text = str(msg.get("text", "")).lower()
        if "whatsapp" in text or "gift card" in text:
            matched_word = "whatsapp" if "whatsapp" in text else "gift card"
            return {
                "score": 60,
                "signals": [
                    {
                        "label": f"suspicious_keyword:{matched_word}",
                        "evidence_msg_id": int(msg.get("id", 0)),
                    }
                ],
            }

    fallback_id = int(window[-1]["id"]) if window and "id" in window[-1] else 0
    return {
        "score": 10,
        "signals": [
            {
                "label": "standard_traffic",
                "evidence_msg_id": fallback_id,
            }
        ],
    }
