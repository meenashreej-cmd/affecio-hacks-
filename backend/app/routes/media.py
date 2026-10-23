import json
import os
import uuid
from typing import Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from backend.app.aggregator import merge_reasons
from backend.app.db import get_db
from backend.app.models import Conversation, Media, RiskEvent, User
from backend.app.schemas import MediaRead

router = APIRouter(tags=["Media"])

UPLOAD_DIR = os.path.abspath("./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/conversations/{conversation_id}/media", response_model=MediaRead, status_code=status.HTTP_201_CREATED)
async def upload_media(
    conversation_id: int,
    sender_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> Any:
    """
    Upload media for a conversation.
    Returns 403 with {detail, reasons} if conversation state is 'restricted'.
    Otherwise saves file to ./uploads and creates a media record.
    """
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    sender = db.query(User).filter(User.id == sender_id).first()
    if not sender:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sender not found")

    if sender_id not in (conversation.user_a, conversation.user_b):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sender is not a participant in this conversation",
        )

    # Check if conversation is restricted
    if conversation.state == "restricted":
        latest_event = (
            db.query(RiskEvent)
            .filter(RiskEvent.conversation_id == conversation_id)
            .order_by(RiskEvent.created_at.desc(), RiskEvent.id.desc())
            .first()
        )
        reasons: list[str] = []
        if latest_event:
            try:
                signals = json.loads(latest_event.signals_json)
                reasons = merge_reasons(rule_signals=signals)
            except Exception:
                reasons = []

        if not reasons:
            reasons = ["Elevated behavioral trust risk"]

        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "detail": "Media sharing is restricted due to high risk behavior",
                "reasons": reasons,
            },
        )

    # Save to ./uploads
    sanitized_filename = os.path.basename(file.filename or "upload.bin")
    unique_filename = f"{uuid.uuid4().hex[:8]}_{sanitized_filename}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)

    file_bytes = await file.read()
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    media_record = Media(
        conversation_id=conversation_id,
        sender_id=sender_id,
        path=file_path,
    )
    db.add(media_record)
    db.commit()
    db.refresh(media_record)

    return media_record
