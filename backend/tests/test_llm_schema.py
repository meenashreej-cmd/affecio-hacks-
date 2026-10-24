import pytest
from pydantic import ValidationError

from backend.llm.schema import LLMResult


def valid_result():
    return {
        "risk_score": 65,
        "scam_type": "romance",
        "signals": [
            {
                "label": "financial_solicitation",
                "evidence": "Repeated requests for gift cards.",
            }
        ],
        "confidence": 0.9,
        "recommended_action": "warn",
    }


def test_valid_result():
    result = LLMResult.model_validate(valid_result())
    assert result.risk_score == 65


@pytest.mark.parametrize("score", [-1, 101])
def test_invalid_score(score):
    data = valid_result()
    data["risk_score"] = score
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_fractional_score_rejected():
    data = valid_result()
    data["risk_score"] = 65.5
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_invalid_scam_type():
    data = valid_result()
    data["scam_type"] = "unknown"
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_too_many_signals():
    data = valid_result()
    data["signals"] = [
        {"label": f"signal_{i}", "evidence": "Evidence"}
        for i in range(6)
    ]
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_label_too_long():
    data = valid_result()
    data["signals"][0]["label"] = "x" * 49
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_unknown_field():
    data = valid_result()
    data["extra"] = "unexpected"
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)


def test_invalid_confidence():
    data = valid_result()
    data["confidence"] = 1.5
    with pytest.raises(ValidationError):
        LLMResult.model_validate(data)
