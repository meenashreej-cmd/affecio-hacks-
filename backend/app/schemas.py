from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


# --- User Schemas ---
class UserBase(BaseModel):
    name: str
    is_new: bool = False
    verified: bool = False


class UserCreate(UserBase):
    pass


class UserRead(UserBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Message Schemas ---
class MessageCreate(BaseModel):
    sender_id: int
    text: str = Field(..., min_length=1)


class MessageRead(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Conversation Schemas ---
class ConversationBase(BaseModel):
    user_a: int
    user_b: int


class ConversationCreate(ConversationBase):
    pass


class ConversationRead(ConversationBase):
    id: int
    risk: int
    state: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Risk Schemas ---
class RiskAssessment(BaseModel):
    risk: int
    state: str
    scam_type: str = "none"
    reasons: list[str] = Field(default_factory=list)


class RiskEventRead(BaseModel):
    id: int
    conversation_id: int
    message_id: int | None
    rule_score: int
    llm_score: int | None
    risk: int
    state: str
    signals_json: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Media Schemas ---
class MediaRead(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    path: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MediaBlockedDetail(BaseModel):
    detail: str
    reasons: list[str] = Field(default_factory=list)


# --- Report Schemas ---
class ReportCreate(BaseModel):
    conversation_id: int
    reporter_id: int
    reason: str = Field(..., min_length=1)


class ReportRead(BaseModel):
    id: int
    conversation_id: int
    reporter_id: int
    reason: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- WebSocket Protocol Schemas ---
class WSClientMessage(BaseModel):
    type: Literal["message"]
    sender_id: int
    text: str


class WSServerMessageEvent(BaseModel):
    type: Literal["message"] = "message"
    message: MessageRead


class WSServerRiskUpdateEvent(BaseModel):
    type: Literal["risk_update"] = "risk_update"
    conversation_id: int
    risk: int
    state: str
    scam_type: str
    reasons: list[str]


class WSServerMediaBlockedEvent(BaseModel):
    type: Literal["media_blocked"] = "media_blocked"
    conversation_id: int
    reasons: list[str]
