import json
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.aggregator import merge_reasons
from backend.app.db import get_db
from backend.app.models import Conversation, Message, RiskEvent, User
from backend.app.pipeline import process_incoming_message
from backend.app.rate_limiter import limiter
from backend.app.schemas import (
    ConversationCreate,
    ConversationRead,
    MessageCreate,
    MessageRead,
    RiskAssessment,
)

router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=list[ConversationRead])
def get_conversations(
    user_id: int | None = Query(None, description="Filter conversations by participant user_id"),
    db: Session = Depends(get_db),
) -> list[Conversation]:
    """Retrieve conversations, optionally filtered by user_id."""
    query = db.query(Conversation)
    if user_id is not None:
        query = query.filter((Conversation.user_a == user_id) | (Conversation.user_b == user_id))
    return query.order_by(Conversation.id.asc()).all()


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
) -> Conversation:
    """Create a new conversation between two users."""
    if payload.user_a == payload.user_b:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="user_a and user_b cannot be the same user",
        )

    # Check user existence
    user_a = db.query(User).filter(User.id == payload.user_a).first()
    user_b = db.query(User).filter(User.id == payload.user_b).first()
    if not user_a or not user_b:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="One or both users do not exist",
        )

    conversation = Conversation(
        user_a=payload.user_a,
        user_b=payload.user_b,
        risk=0,
        state="normal",
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return conversation


@router.get("/{conversation_id}/messages", response_model=list[MessageRead])
def get_messages(
    conversation_id: int,
    db: Session = Depends(get_db),
) -> list[Message]:
    """Retrieve all messages in a conversation ordered by timestamp ascending."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )


@router.post("/{conversation_id}/messages", response_model=MessageRead, status_code=status.HTTP_201_CREATED)
async def post_message(
    conversation_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
) -> Message:
    """Post a new message to a conversation and run the trust scoring pipeline."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    if payload.sender_id not in (conversation.user_a, conversation.user_b):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sender is not a participant in this conversation",
        )

    if limiter.is_rate_limited(payload.sender_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Maximum {limiter.max_messages} messages per {int(limiter.window_seconds)} seconds allowed.",
        )

    new_msg = await process_incoming_message(
        db=db,
        conversation_id=conversation_id,
        sender_id=payload.sender_id,
        text=payload.text,
    )
    return new_msg


@router.get("/{conversation_id}/risk", response_model=RiskAssessment)
def get_conversation_risk(
    conversation_id: int,
    db: Session = Depends(get_db),
) -> RiskAssessment:
    """Retrieve current risk score, state, scam_type, and reason breakdown for a conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    # Fetch latest risk_event to extract reasons and scam type
    latest_event = (
        db.query(RiskEvent)
        .filter(RiskEvent.conversation_id == conversation_id)
        .order_by(RiskEvent.created_at.desc(), RiskEvent.id.desc())
        .first()
    )

    reasons: list[str] = []
    scam_type = "none"

    if latest_event:
        try:
            signals = json.loads(latest_event.signals_json)
            reasons = merge_reasons(rule_signals=signals)
        except Exception:
            reasons = []

        if latest_event.llm_score and latest_event.llm_score >= 50:
            scam_type = "romance"
        elif any("whatsapp" in r or "gift card" in r for r in reasons):
            scam_type = "phishing"

    return RiskAssessment(
        risk=conversation.risk,
        state=conversation.state,
        scam_type=scam_type,
        reasons=reasons,
    )
