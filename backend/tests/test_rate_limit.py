import pytest
from fastapi.testclient import TestClient

from backend.app.db import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models import Message
from backend.app.rate_limiter import limiter
from backend.app.seed import seed_database


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_database()
    limiter.reset()
    yield
    limiter.reset()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_rest_message_rate_limiting(client, monkeypatch):
    """Test that exceeding the per-user rate limit via REST returns 429."""
    monkeypatch.setenv("RATE_LIMIT_MESSAGES", "3")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")

    # Send 3 messages (within limit)
    for i in range(3):
        resp = client.post(
            "/conversations/2/messages",
            json={"sender_id": 1, "text": f"Message {i}"},
        )
        assert resp.status_code == 201

    # 4th message should be rejected with 429 Too Many Requests
    blocked_resp = client.post(
        "/conversations/2/messages",
        json={"sender_id": 1, "text": "Message 4 (over limit)"},
    )
    assert blocked_resp.status_code == 429
    assert "Rate limit exceeded" in blocked_resp.json()["detail"]

    # Different user (Ravi id=2) should NOT be blocked
    other_user_resp = client.post(
        "/conversations/2/messages",
        json={"sender_id": 2, "text": "Hello from Ravi"},
    )
    assert other_user_resp.status_code == 201


def test_websocket_message_rate_limiting(client, monkeypatch):
    """Test that exceeding rate limit over WebSocket emits error event and skips processing."""
    monkeypatch.setenv("RATE_LIMIT_MESSAGES", "2")
    monkeypatch.setenv("RATE_LIMIT_WINDOW_SECONDS", "60")

    with client.websocket_connect("/ws/2?user_id=1") as websocket:
        # Message 1: allowed
        websocket.send_json({"type": "message", "sender_id": 1, "text": "WS message 1"})
        evt1 = websocket.receive_json()
        assert evt1["type"] == "message"
        # Consume risk update if any
        _ = websocket.receive_json()

        # Message 2: allowed
        websocket.send_json({"type": "message", "sender_id": 1, "text": "WS message 2"})
        evt2 = websocket.receive_json()
        assert evt2["type"] == "message"

        # Message 3: rate limited!
        websocket.send_json({"type": "message", "sender_id": 1, "text": "WS message 3 (blocked)"})
        err_evt = websocket.receive_json()
        assert err_evt == {"type": "error", "detail": "rate_limited"}

    # Verify blocked message was NOT saved to the database
    with SessionLocal() as db:
        blocked_msg = db.query(Message).filter(Message.text == "WS message 3 (blocked)").first()
        assert blocked_msg is None
