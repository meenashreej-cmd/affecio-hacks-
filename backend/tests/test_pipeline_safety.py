import asyncio
import os
import pytest
from fastapi.testclient import TestClient

from backend.app.db import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models import Conversation, Message
from backend.app.pipeline import _get_tracker
from backend.app.seed import seed_database


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_database()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_slow_llm_scorer_timeout_and_lock_released(client, monkeypatch):
    """
    Test that when an LLM scorer hangs or is slow, the pipeline:
    1. Times out via LLM_TIMEOUT_SECONDS.
    2. Falls back safely to rule-based scoring.
    3. Allows chat to continue functioning normally.
    4. Releases the one-call-in-flight lock in finally block.
    """
    # Set a tiny timeout for the test
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "0.1")
    monkeypatch.setenv("USE_STUBS", "false")

    async def fake_slow_llm(window):
        # Sleeps longer than LLM_TIMEOUT_SECONDS
        await asyncio.sleep(1.0)
        return {
            "risk_score": 99,
            "scam_type": "romance",
            "signals": [{"label": "fake_slow", "evidence": "slow"}],
            "confidence": 0.9,
            "recommended_action": "block",
        }

    from backend.app import pipeline
    monkeypatch.setattr(pipeline, "evaluate_llm_score", fake_slow_llm)

    # Post a message that triggers the LLM pipeline (rule score >= 25 due to whatsapp)
    resp = client.post(
        "/conversations/1/messages",
        json={"sender_id": 1, "text": "Can we talk on whatsapp?"},
    )
    assert resp.status_code == 201
    created_msg = resp.json()
    assert created_msg["text"] == "Can we talk on whatsapp?"

    # The tracker should have been flagged in-flight initially
    tracker = _get_tracker(1)

    # Use websocket to let the async event loop process the background task timeout
    with client.websocket_connect("/ws/1?user_id=1") as websocket:
        # Give event loop time to hit timeout and run finally block
        # We can send a benign message over websocket
        websocket.send_json({"type": "message", "sender_id": 1, "text": "Are you still there?"})
        event = websocket.receive_json()
        assert event["type"] == "message"

    # Give a short yield for thread/loop completion
    import time
    start = time.time()
    while tracker.is_in_flight and time.time() - start < 2.0:
        time.sleep(0.05)

    # Assert lock is released
    assert tracker.is_in_flight is False, "LLM tracker lock must be released on timeout"

    # Verify chat continues to work and conversation risk is preserved via rules
    resp2 = client.post(
        "/conversations/1/messages",
        json={"sender_id": 1, "text": "Second message after slow LLM timeout"},
    )
    assert resp2.status_code == 201

    risk_resp = client.get("/conversations/1/risk")
    assert risk_resp.status_code == 200
    risk_data = risk_resp.json()
    # It used rule score (60) rather than the slow fake LLM (99)
    assert risk_data["risk"] <= 60
