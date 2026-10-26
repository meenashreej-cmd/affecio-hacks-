
import asyncio
import json
import logging
import os
from typing import Any

from sqlalchemy.orm import Session

from backend.app.aggregator import aggregate_assessment
from backend.app.db import SessionLocal
from backend.app.models import Conversation, Message, RiskEvent, User
from backend.app.ws import manager
from backend.llm.guard import check_score_disagreement
from backend.llm.scorer import llm_score
from backend.rules.engine import rule_score

logger = logging.getLogger(__name__)


def is_use_stubs() -> bool:
    """Return True if offline stubs should be used instead of real scorers."""
    return os.getenv("USE_STUBS", "false").lower() in ("true", "1", "yes")


def stub_rule_score(window: list[dict[str, Any]], recipient: dict[str, Any]) -> dict[str, Any]:
    """Stub rule scoring logic for offline testing."""
    for msg in reversed(window):
        text = str(msg.get("text", "")).lower()
        if "gift card" in text or "money" in text:
            return {
                "score": 60,
                "signals": [
                    {
                        "label": "suspicious_keyword:gift card",
                        "evidence_msg_id": int(msg.get("id", 0)),
                    }
                ],
            }
        if "whatsapp" in text or "telegram" in text:
            return {
                "score": 60,
                "signals": [
                    {
                        "label": "suspicious_keyword:whatsapp",
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


async def stub_llm_score(window: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Stub LLM scorer logic for offline testing and deterministic scenarios."""
    sleep_seconds = float(os.getenv("LLM_SLEEP_SECONDS", "0"))
    if sleep_seconds > 0:
        await asyncio.sleep(sleep_seconds)

    has_financial = False
    has_off_platform = False
    for msg in window:
        text = str(msg.get("text", "")).lower()
        if "money" in text or "gift card" in text:
            has_financial = True
        if "whatsapp" in text or "telegram" in text:
            has_off_platform = True

    if has_financial:
        return {
            "risk_score": 85,
            "scam_type": "romance",
            "signals": [
                {
                    "label": "financial_solicitation",
                    "evidence": "Conversation mentions money or gift cards",
                }
            ],
            "confidence": 0.90,
            "recommended_action": "restrict_media",
        }
    elif has_off_platform:
        return {
            "risk_score": 60,
            "scam_type": "romance",
            "signals": [
                {
                    "label": "suspicious_keyword:whatsapp",
                    "evidence": "Conversation mentions external messaging platform (whatsapp)",
                }
            ],
            "confidence": 0.85,
            "recommended_action": "warn",
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


def evaluate_rule_score(window: list[dict[str, Any]], recipient: dict[str, Any]) -> dict[str, Any]:
    """Evaluates rule score via stub or real engine based on USE_STUBS."""
    if is_use_stubs():
        return stub_rule_score(window, recipient)
    return rule_score(window, recipient)


async def evaluate_llm_score(window: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Evaluates LLM score via stub or real scorer based on USE_STUBS."""
    if is_use_stubs():
        return await stub_llm_score(window)
    return await llm_score(window)


class LLMTracker:
    def __init__(self) -> None:
        self.is_in_flight: bool = False
        self.last_llm_msg_count: int = 0
        self.last_llm_rule_score: int = 0


# Global conversation tracking for LLM background tasks
_conversation_trackers: dict[int, LLMTracker] = {}


def _get_tracker(conversation_id: int) -> LLMTracker:
    if conversation_id not in _conversation_trackers:
        _conversation_trackers[conversation_id] = LLMTracker()
    return _conversation_trackers[conversation_id]


def _build_window(
    db: Session,
    conversation_id: int,
    window_size: int = 12,
) -> list[dict[str, Any]]:
    """Fetch up to the last 12 messages in chronological order."""
    recent_msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(window_size)
        .all()
    )

    ordered = list(reversed(recent_msgs))
    return [
        {
            "id": message.id,
            "sender_id": message.sender_id,
            "text": message.text,
            "created_at": message.created_at.isoformat(),
        }
        for message in ordered
    ]


def _get_recipient_dict(
    db: Session,
    conversation: Conversation,
    sender_id: int,
) -> dict[str, Any]:
    recipient_id = (
        conversation.user_b
        if sender_id == conversation.user_a
        else conversation.user_a
    )
    recipient = db.query(User).filter(User.id == recipient_id).first()

    if recipient:
        return {
            "id": recipient.id,
            "name": recipient.name,
            "is_new": recipient.is_new,
            "verified": recipient.verified,
        }

    return {}


async def run_llm_pipeline_task(
    conversation_id: int,
    message_id: int,
    rule_score_val: int,
    rule_signals: list[dict[str, Any]],
    window: list[dict[str, Any]],
) -> None:
    """Run LLM scoring, merge results, persist the assessment, and broadcast updates."""
    tracker = _get_tracker(conversation_id)

    try:
        raw_timeout = os.getenv("LLM_TIMEOUT_SECONDS", "8")
        try:
            timeout_seconds = float(raw_timeout)
        except ValueError:
            timeout_seconds = 8.0

        llm_res: dict[str, Any] | None = None

        try:
            llm_res = await asyncio.wait_for(
                evaluate_llm_score(window),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "LLM scoring timed out after %s seconds for conversation %s. "
                "Falling back to rule scoring.",
                timeout_seconds,
                conversation_id,
            )
            llm_res = None
        except Exception as err:
            logger.warning(
                "LLM scoring failed or timed out for conversation %s: %s. "
                "Falling back to rule scoring.",
                conversation_id,
                err,
            )
            llm_res = None

        if llm_res is None:
            logger.warning(
                "LLM score unavailable for conversation %s; retaining rule-only scoring.",
                conversation_id,
            )
            return

        with SessionLocal() as db:
            conversation = (
                db.query(Conversation)
                .filter(Conversation.id == conversation_id)
                .first()
            )
            if not conversation:
                return

            recipient_dict = _get_recipient_dict(
                db,
                conversation,
                window[-1]["sender_id"] if window else 0,
            )

            llm_risk_score = (
                llm_res.get("risk_score") if llm_res else None
            )
            llm_scam_type = (
                llm_res.get("scam_type", "none") if llm_res else "none"
            )
            llm_signals = (
                llm_res.get("signals", []) if llm_res else []
            )

            # If a high rule score conflicts with an LLM score of zero,
            # avoid allowing the zero score to reduce the combined risk.
            if llm_res and check_score_disagreement(
                llm_res,
                rule_score=rule_score_val,
            ):
                logger.warning(
                    "Rule/LLM score disagreement for conversation %s; "
                    "using rule-only scoring for this assessment.",
                    conversation_id,
                )
                llm_risk_score = None
                llm_scam_type = "none"
                llm_signals = []

            previous_risk = conversation.risk
            previous_state = conversation.state

            assessment = aggregate_assessment(
                rule_score=rule_score_val,
                llm_score=llm_risk_score,
                previous_risk=previous_risk,
                previous_state=previous_state,
                recipient=recipient_dict,
                rule_signals=rule_signals,
                llm_signals=llm_signals,
                scam_type=llm_scam_type,
            )

            risk_changed = (
                assessment["risk"] != previous_risk
                or assessment["state"] != previous_state
            )

            if risk_changed:
                conversation.risk = assessment["risk"]
                conversation.state = assessment["state"]

                all_signals = list(rule_signals) + list(llm_signals)
                risk_event = RiskEvent(
                    conversation_id=conversation.id,
                    message_id=message_id,
                    rule_score=rule_score_val,
                    llm_score=llm_risk_score,
                    risk=conversation.risk,
                    state=conversation.state,
                    signals_json=json.dumps(all_signals),
                )
                db.add(risk_event)
                db.commit()

                msg_obj = (
                    db.query(Message).filter(Message.id == message_id).first()
                    if message_id
                    else None
                )
                sender_id_val = (
                    msg_obj.sender_id
                    if msg_obj
                    else (window[-1]["sender_id"] if window else None)
                )
                suspect_id = (
                    sender_id_val if conversation.risk > previous_risk else None
                )

                await manager.broadcast(
                    conversation_id,
                    {
                        "type": "risk_update",
                        "conversation_id": conversation_id,
                        "risk": conversation.risk,
                        "state": conversation.state,
                        "scam_type": assessment["scam_type"],
                        "reasons": assessment["reasons"],
                        "suspect_id": suspect_id,
                    },
                )

    except asyncio.CancelledError:
        raise
    except Exception as exc:
        logger.exception(
            "Error in LLM background pipeline for conversation %s: %s",
            conversation_id,
            exc,
        )
    finally:
        tracker.is_in_flight = False


async def process_incoming_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    text: str,
) -> Message:
    """
    Process an incoming message:
    1. Save and broadcast the message.
    2. Run rule-based scoring and persist the initial assessment.
    3. Trigger LLM scoring in the background when conditions are met.
    4. Fall back to rule-based scoring when LLM scoring fails.
    """
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id)
        .first()
    )
    if not conversation:
        raise ValueError(f"Conversation {conversation_id} not found")

    # 1. Save message
    new_message = Message(
        conversation_id=conversation_id,
        sender_id=sender_id,
        text=text,
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)

    # Broadcast message event
    await manager.broadcast(
        conversation_id,
        {
            "type": "message",
            "message": {
                "id": new_message.id,
                "conversation_id": new_message.conversation_id,
                "sender_id": new_message.sender_id,
                "text": new_message.text,
                "created_at": new_message.created_at.isoformat(),
            },
        },
    )

    # 2. Build the conversation window and recipient information
    window = _build_window(db, conversation_id, window_size=12)
    recipient_dict = _get_recipient_dict(db, conversation, sender_id)

    # Run rule-based scoring synchronously
    rule_res = evaluate_rule_score(window, recipient_dict)
    rule_score_val = int(rule_res.get("score", 0))
    rule_signals = rule_res.get("signals", [])

    previous_risk = conversation.risk
    previous_state = conversation.state

    # Initial assessment uses rules only
    assessment = aggregate_assessment(
        rule_score=rule_score_val,
        llm_score=None,
        previous_risk=previous_risk,
        previous_state=previous_state,
        recipient=recipient_dict,
        rule_signals=rule_signals,
    )

    risk_changed = (
        assessment["risk"] != previous_risk
        or assessment["state"] != previous_state
    )

    if risk_changed:
        conversation.risk = assessment["risk"]
        conversation.state = assessment["state"]

        risk_event = RiskEvent(
            conversation_id=conversation.id,
            message_id=new_message.id,
            rule_score=rule_score_val,
            llm_score=None,
            risk=conversation.risk,
            state=conversation.state,
            signals_json=json.dumps(rule_signals),
        )
        db.add(risk_event)
        db.commit()
        db.refresh(conversation)

        suspect_id = sender_id if assessment["risk"] > previous_risk else None
        await manager.broadcast(
            conversation_id,
            {
                "type": "risk_update",
                "conversation_id": conversation_id,
                "risk": conversation.risk,
                "state": conversation.state,
                "scam_type": assessment["scam_type"],
                "reasons": assessment["reasons"],
                "suspect_id": suspect_id,
            },
        )

    # 3. Check conditions for background LLM evaluation
    tracker = _get_tracker(conversation_id)
    total_messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .count()
    )

    messages_since_last_llm = total_messages - tracker.last_llm_msg_count
    rule_score_rise = rule_score_val - tracker.last_llm_rule_score
    hard_signal_fired = rule_score_val >= 25

    should_trigger_llm = (
        (
            messages_since_last_llm >= 3
            or rule_score_rise >= 20
            or hard_signal_fired
        )
        and not tracker.is_in_flight
    )

    if should_trigger_llm:
        tracker.is_in_flight = True
        tracker.last_llm_msg_count = total_messages
        tracker.last_llm_rule_score = rule_score_val

        try:
            asyncio.create_task(
                run_llm_pipeline_task(
                    conversation_id=conversation_id,
                    message_id=new_message.id,
                    rule_score_val=rule_score_val,
                    rule_signals=rule_signals,
                    window=window,
                )
            )
        except Exception:
            tracker.is_in_flight = False
            raise

    return new_message
