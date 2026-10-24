import io
import os
import time
import pytest
from fastapi.testclient import TestClient

# Ensure deterministic stubs and fast test execution
os.environ["USE_STUBS"] = "true"
os.environ["LLM_SLEEP_SECONDS"] = "0"
os.environ["DATABASE_URL"] = "sqlite:///./test_chat.db"

from backend.app.db import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models import Conversation, Message, RiskEvent, User
from backend.app.seed import seed_database


@pytest.fixture(autouse=True)
def setup_test_db():
    """Setup clean seeded database before test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_database()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_demo_flow_scenario(client):
    """
    TASK 6 - End-to-end demo test scenario:
    Sam (user 3) messages Asha (user 1) in conversation 1 with:
    1. friendly hello
    2. a romantic message
    3. 'add me on whatsapp'
    4. 'send a gift card urgently'

    Assertions:
    - State moves normal -> caution -> restricted in the expected order.
    - suspect_id is 3 on risk updates.
    - Reasons are plain English sentences.
    - Media upload returns 403 afterward.
    - risk_events has one row per update.
    """
    states_observed: list[str] = []
    risk_updates_observed: list[dict] = []

    with client.websocket_connect("/ws/1?user_id=1") as websocket:
        # Message 1: friendly hello
        resp1 = client.post(
            "/conversations/1/messages",
            json={"sender_id": 3, "text": "Hello Asha, nice to meet you!"},
        )
        assert resp1.status_code == 201

        # Read WS events for Message 1
        msg1_evt = websocket.receive_json()
        assert msg1_evt["type"] == "message"
        assert msg1_evt["message"]["sender_id"] == 3

        # Risk update 1: initial baseline risk (0 -> 10, normal)
        risk1_evt = websocket.receive_json()
        assert risk1_evt["type"] == "risk_update"
        assert risk1_evt["state"] == "normal"
        assert risk1_evt["suspect_id"] == 3
        states_observed.append(risk1_evt["state"])
        risk_updates_observed.append(risk1_evt)

        # Message 2: a romantic message
        resp2 = client.post(
            "/conversations/1/messages",
            json={"sender_id": 3, "text": "You look gorgeous, I think I have feelings for you."},
        )
        assert resp2.status_code == 201

        # Read WS event for Message 2
        msg2_evt = websocket.receive_json()
        assert msg2_evt["type"] == "message"
        assert msg2_evt["message"]["sender_id"] == 3
        # No risk_update event because risk/state did not change

        # Message 3: "add me on whatsapp"
        resp3 = client.post(
            "/conversations/1/messages",
            json={"sender_id": 3, "text": "Can you please add me on whatsapp? Let's talk there."},
        )
        assert resp3.status_code == 201

        # Read WS events for Message 3
        msg3_evt = websocket.receive_json()
        assert msg3_evt["type"] == "message"

        risk3_evt = websocket.receive_json()
        assert risk3_evt["type"] == "risk_update"
        assert risk3_evt["state"] == "caution"
        assert risk3_evt["suspect_id"] == 3
        # Plain English reasons check
        assert any(
            "Asked to move the chat off the app" in r for r in risk3_evt["reasons"]
        )
        states_observed.append(risk3_evt["state"])
        risk_updates_observed.append(risk3_evt)

        # Allow brief cycle for background tasks
        time.sleep(0.05)

        # Message 4: "send a gift card urgently"
        resp4 = client.post(
            "/conversations/1/messages",
            json={"sender_id": 3, "text": "Please send a gift card urgently, I need your help!"},
        )
        assert resp4.status_code == 201

        # Read WS events for Message 4
        msg4_evt = websocket.receive_json()
        assert msg4_evt["type"] == "message"

        # Risk update 3 (from LLM pipeline background task completion)
        risk4_evt = websocket.receive_json()
        assert risk4_evt["type"] == "risk_update"
        assert risk4_evt["state"] == "restricted"
        assert risk4_evt["suspect_id"] == 3
        assert any(
            "Asked for money or gift cards" in r for r in risk4_evt["reasons"]
        )
        states_observed.append(risk4_evt["state"])
        risk_updates_observed.append(risk4_evt)

        # Assert state progression order: normal -> caution -> restricted
        assert states_observed == ["normal", "caution", "restricted"]

        # Confirm all suspect_ids are Sam (id=3)
        for update in risk_updates_observed:
            assert update["suspect_id"] == 3

        # Confirm all reasons are plain English sentences across all updates
        for update in risk_updates_observed:
            for reason in update["reasons"]:
                # Ensure no technical internal labels like "suspicious_keyword:" leak out
                assert not reason.startswith("suspicious_keyword:")
                assert not reason.startswith("evidence_msg_id")

        # Media upload afterward must return 403 Forbidden
        fake_image = b"\x89PNG\r\n\x1a\nfake-image-bytes"
        files = {"file": ("photo.png", io.BytesIO(fake_image), "image/png")}
        media_resp = client.post(
            "/conversations/1/media",
            data={"sender_id": 1},
            files=files,
        )
        assert media_resp.status_code == 403
        error_payload = media_resp.json()
        assert "detail" in error_payload
        assert "reasons" in error_payload
        assert len(error_payload["reasons"]) > 0
        for r in error_payload["reasons"]:
            assert not r.startswith("suspicious_keyword:")

        # WebSocket also receives media_blocked event on upload refusal
        blocked_evt = websocket.receive_json()
        assert blocked_evt["type"] == "media_blocked"
        assert blocked_evt["conversation_id"] == 1
        assert "reasons" in blocked_evt

    # Assert database state: risk_events has one row per update
    with SessionLocal() as db:
        conv = db.query(Conversation).filter(Conversation.id == 1).first()
        assert conv is not None
        assert conv.state == "restricted"
        assert conv.risk >= 70

        events = (
            db.query(RiskEvent)
            .filter(RiskEvent.conversation_id == 1)
            .order_by(RiskEvent.id.asc())
            .all()
        )
        # Exactly 3 updates occurred (normal, caution, restricted), so exactly 3 rows
        assert len(events) == 3, f"Expected 3 risk_events rows, got {len(events)}"

        # Verify progression in risk_events rows
        assert events[0].state == "normal"
        assert events[0].risk == 10
        assert events[1].state == "caution"
        assert events[1].risk == 60
        assert events[2].state == "restricted"
        assert events[2].risk == 75
        assert events[2].llm_score == 85
