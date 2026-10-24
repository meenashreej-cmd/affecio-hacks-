import json
from types import SimpleNamespace

import pytest

from backend.llm import scorer


VALID_RESULT = {
    "risk_score": 75,
    "scam_type": "romance",
    "signals": [
        {
            "label": "financial_request",
            "evidence": "The sender requested money for an emergency.",
        }
    ],
    "confidence": 0.85,
    "recommended_action": "warn",
}


class FakeMessages:
    def __init__(self, response_text=None, error=None):
        self.response_text = response_text
        self.error = error
        self.kwargs = None

    async def create(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return SimpleNamespace(
            content=[
                SimpleNamespace(type="text", text=self.response_text)
            ]
        )


class FakeClient:
    def __init__(self, messages):
        self.messages = messages

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


@pytest.mark.asyncio
async def test_valid_response_is_returned_as_dictionary(monkeypatch):
    messages = FakeMessages(json.dumps(VALID_RESULT))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        scorer,
        "AsyncAnthropic",
        lambda **kwargs: FakeClient(messages),
    )

    result = await scorer.llm_score([
        {"sender_id": 1, "text": "Please send me money."}
    ])

    assert result == VALID_RESULT
    assert isinstance(result, dict)
    assert messages.kwargs["model"]


@pytest.mark.asyncio
async def test_missing_api_key_returns_none(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    result = await scorer.llm_score([{"text": "Hello"}])

    assert result is None


@pytest.mark.asyncio
async def test_invalid_json_returns_none(monkeypatch):
    messages = FakeMessages("not valid JSON")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        scorer,
        "AsyncAnthropic",
        lambda **kwargs: FakeClient(messages),
    )

    result = await scorer.llm_score([{"text": "Hello"}])

    assert result is None


@pytest.mark.asyncio
async def test_schema_violation_returns_none(monkeypatch):
    invalid = {**VALID_RESULT, "risk_score": 150}
    messages = FakeMessages(json.dumps(invalid))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        scorer,
        "AsyncAnthropic",
        lambda **kwargs: FakeClient(messages),
    )

    result = await scorer.llm_score([{"text": "Hello"}])

    assert result is None


@pytest.mark.asyncio
async def test_api_error_returns_none(monkeypatch):
    messages = FakeMessages(error=RuntimeError("simulated API error"))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        scorer,
        "AsyncAnthropic",
        lambda **kwargs: FakeClient(messages),
    )

    result = await scorer.llm_score([{"text": "Hello"}])

    assert result is None


@pytest.mark.asyncio
async def test_personal_information_is_redacted_before_api_call(monkeypatch):
    messages = FakeMessages(json.dumps(VALID_RESULT))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(
        scorer,
        "AsyncAnthropic",
        lambda **kwargs: FakeClient(messages),
    )

    await scorer.llm_score([
        {
            "sender_id": 123,
            "text": "Contact me at alex@example.com",
            "id": 999,
        }
    ])

    sent_prompt = messages.kwargs["messages"][0]["content"]
    assert "alex@example.com" not in sent_prompt
    assert "[EMAIL]" in sent_prompt
    assert "999" not in sent_prompt
