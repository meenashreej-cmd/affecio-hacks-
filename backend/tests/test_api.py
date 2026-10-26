import io
import os
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

# Configure fast LLM execution for tests
os.environ["LLM_SLEEP_SECONDS"] = "0"
os.environ["DATABASE_URL"] = "sqlite:///./test_chat.db"

from backend.app.db import Base, SessionLocal, engine
from backend.app.main import app
from backend.app.models import Conversation, Message, RiskEvent, User
from backend.app.seed import seed_database


@pytest.fixture(autouse=True)
def setup_test_db():
    """Setup clean seeded database before each test."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_database()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    return TestClient(app)


def test_get_users(client):
    """Confirm GET /users returns seeded users."""
    response = client.get("/users")
    assert response.status_code == 200
    users = response.json()
    assert len(users) == 3
    names = [u["name"] for u in users]
    assert "Asha" in names
    assert "Ravi" in names
    assert "Sam" in names


def test_get_conversations_filtered(client):
    """Confirm GET /conversations with user_id filter."""
    response = client.get("/conversations?user_id=1")
    assert response.status_code == 200
    convs = response.json()
    assert len(convs) == 2


def test_normal_conversation_allows_media(client):
    """
    Test that a normal conversation with benign messages remains normal
    and successfully accepts media uploads (HTTP 201).
    """
    # 1. Post benign messages in conversation 2 (Asha and Ravi)
    msg_resp = client.post(
        "/conversations/2/messages",
        json={"sender_id": 1, "text": "Hi Ravi, hope you are having a productive day!"},
    )
    assert msg_resp.status_code == 201
    assert msg_resp.json()["text"] == "Hi Ravi, hope you are having a productive day!"

    # 2. Check risk endpoint
    risk_resp = client.get("/conversations/2/risk")
    assert risk_resp.status_code == 200
    risk_data = risk_resp.json()
    assert risk_data["state"] == "normal"
    assert risk_data["risk"] < 40

    # 3. Upload media
    file_content = b"fake image content"
    files = {"file": ("test_avatar.png", io.BytesIO(file_content), "image/png")}
    data = {"sender_id": 1}

    media_resp = client.post("/conversations/2/media", data=data, files=files)
    assert media_resp.status_code == 201
    media_data = media_resp.json()
    assert media_data["conversation_id"] == 2
    assert media_data["sender_id"] == 1
    assert "path" in media_data
    assert os.path.exists(media_data["path"])


def test_restricted_conversation_blocks_media(client):
    """
    Test that when suspicious messages are posted and risk threshold is reached,
    conversation state transitions to 'restricted' and POST /media returns 403.
    """
    # In conversation 1 (Asha id=1, Sam id=3 [new, unverified]):
    # Posting message mentioning 'whatsapp' or 'gift card' triggers rule score 60.
    # When sender is Asha (id=1) sending to Sam (id=3), recipient Sam has threshold_restrict = 60.
    # Thus risk 60 immediately restricts the conversation synchronously!
    msg_resp = client.post(
        "/conversations/1/messages",
        json={"sender_id": 1, "text": "Do not send any gift card or contact outside on whatsapp."},
    )
    assert msg_resp.status_code == 201

    # Check risk state
    risk_resp = client.get("/conversations/1/risk")
    assert risk_resp.status_code == 200
    risk_data = risk_resp.json()
    assert risk_data["state"] == "restricted"
    assert len(risk_data["reasons"]) > 0

    # Attempt media upload in restricted state
    file_content = b"restricted image"
    files = {"file": ("scam_proof.jpg", io.BytesIO(file_content), "image/jpeg")}
    data = {"sender_id": 1}

    media_resp = client.post("/conversations/1/media", data=data, files=files)
    assert media_resp.status_code == 403
    error_body = media_resp.json()
    assert "detail" in error_body
    assert "reasons" in error_body
    assert len(error_body["reasons"]) > 0


def test_post_report(client):
    """Test safety reporting endpoint."""
    report_resp = client.post(
        "/reports",
        json={
            "conversation_id": 1,
            "reporter_id": 1,
            "reason": "Suspicious request for gift card payment.",
        },
    )
    assert report_resp.status_code == 201
    report_data = report_resp.json()
    assert report_data["conversation_id"] == 1
    assert report_data["reporter_id"] == 1
    assert report_data["reason"] == "Suspicious request for gift card payment."


def test_websocket_chat_and_risk(client):
    """Test WebSocket interaction: sending messages and receiving events."""
    with client.websocket_connect("/ws/2?user_id=1") as websocket:
        # Client sends a message
        websocket.send_json({"type": "message", "sender_id": 1, "text": "Hello via websocket!"})

        # Server broadcasts message event
        msg_event = websocket.receive_json()
        assert msg_event["type"] == "message"
        assert msg_event["message"]["text"] == "Hello via websocket!"

        # Server broadcasts risk update
        risk_event = websocket.receive_json()
        assert risk_event["type"] == "risk_update"
        assert risk_event["conversation_id"] == 2
        assert "risk" in risk_event
        assert "state" in risk_event
        assert "suspect_id" in risk_event


def test_media_upload_hardening(client):
    """Test media upload validations: allowed extensions/content-types, 5MB limit, and UUID filename."""
    # 1. Disallowed extension
    files = {"file": ("malicious.exe", io.BytesIO(b"executable content"), "application/octet-stream")}
    resp = client.post("/conversations/2/media", data={"sender_id": 1}, files=files)
    assert resp.status_code == 400
    assert "Invalid media type" in resp.json()["detail"]

    # 2. Mismatched content-type
    files = {"file": ("photo.png", io.BytesIO(b"pretend image"), "text/plain")}
    resp = client.post("/conversations/2/media", data={"sender_id": 1}, files=files)
    assert resp.status_code == 400

    # 3. Size exceeding 5 MB
    large_content = b"0" * (5 * 1024 * 1024 + 1)
    files = {"file": ("huge_image.png", io.BytesIO(large_content), "image/png")}
    resp = client.post("/conversations/2/media", data={"sender_id": 1}, files=files)
    assert resp.status_code == 413
    assert "exceeds" in resp.json()["detail"]

    # 4. Valid image saves under a random UUID filename (never client's filename)
    valid_content = b"\x89PNG\r\n\x1a\nfake-png-bytes"
    files = {"file": ("my_sensitive_name.png", io.BytesIO(valid_content), "image/png")}
    resp = client.post("/conversations/2/media", data={"sender_id": 1}, files=files)
    assert resp.status_code == 201
    saved_path = resp.json()["path"]
    filename = os.path.basename(saved_path)
    assert "my_sensitive_name" not in filename
    assert filename.endswith(".png")
    # UUID hex is 32 chars + .png = 36 chars
    assert len(filename) == 36


def test_media_blocked_event_on_upload_refusal(client):
    """Test that media_blocked WebSocket event is emitted when upload is refused due to restricted state."""
    # Restrict conversation 1
    client.post(
        "/conversations/1/messages",
        json={"sender_id": 1, "text": "Move to whatsapp now."},
    )

    with client.websocket_connect("/ws/1?user_id=1") as websocket:
        # Attempt media upload in restricted state
        files = {"file": ("test.png", io.BytesIO(b"png data"), "image/png")}
        media_resp = client.post("/conversations/1/media", data={"sender_id": 1}, files=files)
        assert media_resp.status_code == 403

        # WebSocket receives media_blocked event
        event = websocket.receive_json()
        assert event["type"] == "media_blocked"
        assert event["conversation_id"] == 1
        assert "reasons" in event
        # Label should be humanized English
        assert any("Asked to move the chat off the app" in r for r in event["reasons"])


def test_post_message_non_participant_forbidden(client):
    """POST /conversations/{id}/messages returns 403 when sender_id is not a participant."""
    # Conversation 1 participants are user 1 (Asha) and user 3 (Sam).
    # User 2 (Ravi) is NOT a participant.
    resp = client.post(
        "/conversations/1/messages",
        json={"sender_id": 2, "text": "Intruder message"},
    )
    assert resp.status_code == 403
    assert "not a participant" in resp.json()["detail"]


def test_websocket_participant_validation_and_sender_id_override(client):
    """
    1. Verify non-participant connecting to WebSocket is closed with code 4403.
    2. Verify WebSocket ignores client-supplied sender_id and uses the connection user_id.
    """
    # Conversation 1 participants: Asha (1) and Sam (3). User 2 (Ravi) is not a participant.
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect("/ws/1?user_id=2"):
            pass
    assert exc_info.value.code == 4403

    # Valid participant connects: Asha (user_id=1)
    with client.websocket_connect("/ws/1?user_id=1") as websocket:
        # Client tries to spoof sender_id as 3 (Sam)
        websocket.send_json({"type": "message", "sender_id": 3, "text": "I am actually Asha"})
        evt = websocket.receive_json()
        assert evt["type"] == "message"
        # Server must override sender_id with connection's user_id (1)
        assert evt["message"]["sender_id"] == 1
        assert evt["message"]["text"] == "I am actually Asha"
