"""Strict validation for LLM behavioral risk assessments."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ScamType = Literal[
    "romance",
    "phishing",
    "impersonation",
    "sextortion",
    "none",
]

RecommendedAction = Literal[
    "allow",
    "warn",
    "restrict_media",
    "block",
]


class LLMSignal(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: str = Field(min_length=1, max_length=48)
    evidence: str = Field(min_length=1, max_length=240)


class LLMResult(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    risk_score: int = Field(ge=0, le=100, strict=True)
    scam_type: ScamType
    signals: list[LLMSignal] = Field(max_length=5)
    confidence: float = Field(ge=0.0, le=1.0, allow_inf_nan=False)
    recommended_action: RecommendedAction
