from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.db import get_db
from backend.app.models import Conversation, Report, User
from backend.app.schemas import ReportCreate, ReportRead

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def submit_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
) -> Report:
    """Submit a safety report for a suspicious conversation."""
    conversation = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    reporter = db.query(User).filter(User.id == payload.reporter_id).first()
    if not reporter:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reporter not found")

    report = Report(
        conversation_id=payload.conversation_id,
        reporter_id=payload.reporter_id,
        reason=payload.reason,
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
