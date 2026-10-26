import os
from typing import Any
from dotenv import load_dotenv

load_dotenv()

DEFAULT_THRESHOLD_CAUTION = int(os.getenv("THRESHOLD_CAUTION", "40"))
DEFAULT_THRESHOLD_RESTRICT = int(os.getenv("THRESHOLD_RESTRICT", "70"))


def get_effective_thresholds(
    recipient: dict[str, Any] | None,
    threshold_caution: int = DEFAULT_THRESHOLD_CAUTION,
    threshold_restrict: int = DEFAULT_THRESHOLD_RESTRICT,
) -> tuple[int, int]:
    """
    Computes effective thresholds based on recipient profile.
    If the recipient is new (is_new=True) or not verified (verified=False),
    lower both caution and restrict thresholds by 10.
    """
    is_vulnerable = False
    if recipient:
        is_new = bool(recipient.get("is_new", False))
        is_verified = bool(recipient.get("verified", False))
        if is_new or not is_verified:
            is_vulnerable = True

    if is_vulnerable:
        return threshold_caution - 10, threshold_restrict - 10

    return threshold_caution, threshold_restrict


def calculate_risk(
    rule_score: int,
    llm_score: int | None,
    previous_risk: int = 0,
) -> int:
    """
    Calculate updated conversation risk:
    - new_risk = 0.4*rule_score + 0.6*llm_score if llm result exists, else rule_score
    - risk = max(new_risk, 0.85 * previous_risk), rounded to int, capped at 100
    """
    if llm_score is not None:
        new_risk = 0.4 * float(rule_score) + 0.6 * float(llm_score)
    else:
        new_risk = float(rule_score)

    decayed_previous = 0.85 * float(previous_risk)
    final_risk = max(new_risk, decayed_previous)

    # Round to nearest int, clamp between 0 and 100
    risk_int = int(round(final_risk))
    return max(0, min(100, risk_int))


def determine_state(
    risk: int,
    previous_state: str = "normal",
    recipient: dict[str, Any] | None = None,
    threshold_caution: int = DEFAULT_THRESHOLD_CAUTION,
    threshold_restrict: int = DEFAULT_THRESHOLD_RESTRICT,
) -> str:
    """
    Determine conversation state ("normal", "caution", "restricted").
    "restricted" is sticky: once restricted, the state never goes back down.
    Thresholds are adjusted by -10 if the recipient is new or unverified.
    """
    if previous_state == "restricted":
        return "restricted"

    caution_th, restrict_th = get_effective_thresholds(
        recipient=recipient,
        threshold_caution=threshold_caution,
        threshold_restrict=threshold_restrict,
    )

    if risk >= restrict_th:
        return "restricted"
    elif risk >= caution_th:
        return "caution"
    return "normal"


SIGNAL_LABEL_MAP: dict[str, str] = {
    "suspicious_keyword:whatsapp": "Asked to move the chat off the app",
    "suspicious_keyword:gift card": "Asked for money or gift cards",
    "suspicious_keyword:money": "Asked for money or gift cards",
    "suspicious_keyword:link": "Shared a suspicious link",
    "suspicious_keyword:links": "Shared a suspicious link",
    "money/gift card": "Asked for money or gift cards",
    "financial_solicitation": "Asked for money or gift cards",
    "links": "Shared a suspicious link",
    "whatsapp": "Asked to move the chat off the app",
}


def humanize_signal_label(label: str) -> str:
    """
    Translates technical or keyword signal labels into plain English sentences.
    Unknown labels and labels that are already natural language sentences pass through unchanged.
    """
    if not label or not isinstance(label, str):
        return str(label) if label else ""
    if label in SIGNAL_LABEL_MAP:
        return SIGNAL_LABEL_MAP[label]
    lower = label.lower().strip()
    if lower in SIGNAL_LABEL_MAP:
        return SIGNAL_LABEL_MAP[lower]
    if lower.startswith("suspicious_keyword:"):
        kw = lower.split(":", 1)[1].strip()
        if "whatsapp" in kw or "telegram" in kw or "chat" in kw or "phone" in kw:
            return "Asked to move the chat off the app"
        if "gift" in kw or "money" in kw or "card" in kw:
            return "Asked for money or gift cards"
        if "link" in kw or "url" in kw:
            return "Shared a suspicious link"
        return f"Mentioned suspicious keyword: {kw}"
    return label


def merge_reasons(
    rule_signals: list[dict[str, Any]] | None = None,
    llm_signals: list[dict[str, Any]] | None = None,
    max_reasons: int = 5,
) -> list[str]:
    """
    Merge reasons from rule and LLM signal labels (deduplicated, order-preserving, max 5).
    Converts internal signal keys to plain English sentences.
    """
    reasons: list[str] = []
    seen: set[str] = set()

    for signal_list in [rule_signals or [], llm_signals or []]:
        for item in signal_list:
            if isinstance(item, dict):
                raw_label = item.get("label") or item.get("evidence")
            elif isinstance(item, str):
                raw_label = item
            else:
                raw_label = str(item)

            label = humanize_signal_label(raw_label) if raw_label else ""

            if label and label not in seen:
                seen.add(label)
                reasons.append(label)
                if len(reasons) >= max_reasons:
                    return reasons

    return reasons


def aggregate_assessment(
    rule_score: int,
    llm_score: int | None,
    previous_risk: int,
    previous_state: str,
    recipient: dict[str, Any] | None,
    rule_signals: list[dict[str, Any]] | None = None,
    llm_signals: list[dict[str, Any]] | None = None,
    scam_type: str = "none",
    threshold_caution: int = DEFAULT_THRESHOLD_CAUTION,
    threshold_restrict: int = DEFAULT_THRESHOLD_RESTRICT,
) -> dict[str, Any]:
    """
    Pure aggregator entrypoint combining risk score calculation,
    state determination with stickiness, and reason extraction.
    """
    risk = calculate_risk(
        rule_score=rule_score,
        llm_score=llm_score,
        previous_risk=previous_risk,
    )

    state = determine_state(
        risk=risk,
        previous_state=previous_state,
        recipient=recipient,
        threshold_caution=threshold_caution,
        threshold_restrict=threshold_restrict,
    )

    reasons = merge_reasons(
        rule_signals=rule_signals,
        llm_signals=llm_signals,
    )

    return {
        "risk": risk,
        "state": state,
        "scam_type": scam_type,
        "reasons": reasons,
    }
