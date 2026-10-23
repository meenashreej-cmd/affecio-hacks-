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
from backend.llm.scorer import llm_score
from backend.rules.engine import rule_score

logger = logging.getLogger(__name__)


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


def _build_window(db: Session, conversation_id: int, window_size: int = 12) -> list[dict[str, Any]]:
    """Fetches up to the last 12 messages in chronological order (oldest first)."""
    recent_msgs = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(window_size)
        .all()
    )
    # Reverse so oldest is first
    ordered = list(reversed(recent_msgs))
    return [
        {
            "id": m.id,
            "sender_id": m.sender_id,
            "text": m.text,
            "created_at": m.created_at.isoformat(),
        }
        for m in ordered
    ]


def _get_recipient_dict(db: Session, conversation: Conversation, sender_id: int) -> dict[str, Any]:
    recipient_id = conversation.user_b if sender_id == conversation.user_a else conversation.user_a
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
    """Async background task to run LLM scoring, merge with aggregator, and broadcast updates."""
    tracker = _get_tracker(conversation_id)
    try:
        timeout_seconds = int(os.getenv("LLM_TIMEOUT_SECONDS", "8"))
        llm_res: dict[str, Any] | None = None
        try:
            llm_res = await asyncio.wait_for(llm_score(window), timeout=timeout_seconds)
        except (asyncio.TimeoutError, Exception) as err:
            logger.warning(f"LLM scoring failed or timed out for conversation {conversation_id}: {err}. Falling back to rule scoring.")
            llm_res = None

        with SessionLocal() as db:
            conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
            if not conversation:
                return

            recipient_dict = _get_recipient_dict(db, conversation, window[-1]["sender_id"] if window else 0)

            llm_risk_score = llm_res.get("risk_score") if llm_res else None
            llm_scam_type = llm_res.get("scam_type", "none") if llm_res else "none"
            llm_signals = llm_res.get("signals", []) if llm_res else []

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

            # Broadcast risk update to clients
            await manager.broadcast(
                conversation_id,
                {
                    "type": "risk_update",
                    "conversation_id": conversation_id,
                    "risk": conversation.risk,
                    "state": conversation.state,
                    "scam_type": assessment["scam_type"],
                    "reasons": assessment["reasons"],
                },
            )

            if conversation.state == "restricted" and previous_state != "restricted":
                await manager.broadcast(
                    conversation_id,
                    {
                        "type": "media_blocked",
                        "conversation_id": conversation_id,
                        "reasons": assessment["reasons"],
                    },
                )
    except Exception as exc:
        logger.exception(f"Error in LLM background pipeline for conversation {conversation_id}: {exc}")
    finally:
        tracker.is_in_flight = False


async def process_incoming_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    text: str,
) -> Message:
    """
    Core pipeline executed after each incoming message:
    1. Save message, broadcast the 'message' event.
    2. Run rule_score synchronously, update risk, write risk_events row,
       broadcast risk_update if risk or state changed.
    3. Trigger llm_score as background task if conditions met (and not already in flight).
    4. LLM failure falls back cleanly to rules.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
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

    # 2. Window & Recipient extraction
    window = _build_window(db, conversation_id, window_size=12)
    recipient_dict = _get_recipient_dict(db, conversation, sender_id)

    # Run rule_score synchronously
    rule_res = rule_score(window, recipient_dict)
    rule_score_val = int(rule_res.get("score", 0))
    rule_signals = rule_res.get("signals", [])

    previous_risk = conversation.risk
    previous_state = conversation.state

    # Run aggregator with rules only
    assessment = aggregate_assessment(
        rule_score=rule_score_val,
        llm_score=None,
        previous_risk=previous_risk,
        previous_state=previous_state,
        recipient=recipient_dict,
        rule_signals=rule_signals,
    )

    risk_changed = (assessment["risk"] != previous_risk) or (assessment["state"] != previous_state)

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

    if risk_changed:
        await manager.broadcast(
            conversation_id,
            {
                "type": "risk_update",
                "conversation_id": conversation_id,
                "risk": conversation.risk,
                "state": conversation.state,
                "scam_type": assessment["scam_type"],
                "reasons": assessment["reasons"],
            },
        )
        if conversation.state == "restricted" and previous_state != "restricted":
            await manager.broadcast(
                conversation_id,
                {
                    "type": "media_blocked",
                    "conversation_id": conversation_id,
                    "reasons": assessment["reasons"],
                },
            )

    # 3. Check trigger conditions for LLM background evaluation
    tracker = _get_tracker(conversation_id)
    total_messages = db.query(Message).filter(Message.conversation_id == conversation_id).count()

    messages_since_last_llm = total_messages - tracker.last_llm_msg_count
    rule_score_rise = rule_score_val - tracker.last_llm_rule_score
    hard_signal_fired = rule_score_val >= 25

    should_trigger_llm = (
        (messages_since_last_llm >= 3 or rule_score_rise >= 20 or hard_signal_fired)
        and not tracker.is_in_flight
    )

    if should_trigger_llm:
        tracker.is_in_flight = True
        tracker.last_llm_msg_count = total_messages
        tracker.last_llm_rule_score = rule_score_val

        asyncio.create_task(
            run_llm_pipeline_task(
                conversation_id=conversation_id,
                message_id=new_message.id,
                rule_score_val=rule_score_val,
                rule_signals=rule_signals,
                window=window,
            )
        )

    return new_message
