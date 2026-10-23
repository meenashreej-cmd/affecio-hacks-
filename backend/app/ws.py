import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session

from backend.app.db import get_db

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections per conversation and broadcasts events."""

    def __init__(self) -> None:
        # conversation_id -> set of active WebSockets
        self.active_connections: dict[int, set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, conversation_id: int) -> None:
        await websocket.accept()
        if conversation_id not in self.active_connections:
            self.active_connections[conversation_id] = set()
        self.active_connections[conversation_id].add(websocket)
        logger.info(f"WebSocket connected for conversation {conversation_id}. Total: {len(self.active_connections[conversation_id])}")

    def disconnect(self, websocket: WebSocket, conversation_id: int) -> None:
        if conversation_id in self.active_connections:
            self.active_connections[conversation_id].discard(websocket)
            if not self.active_connections[conversation_id]:
                del self.active_connections[conversation_id]
        logger.info(f"WebSocket disconnected for conversation {conversation_id}")

    async def broadcast(self, conversation_id: int, message: dict[str, Any]) -> None:
        if conversation_id not in self.active_connections:
            return

        dead_connections: list[WebSocket] = []
        for connection in list(self.active_connections[conversation_id]):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to connection in conversation {conversation_id}: {e}")
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead, conversation_id)


manager = ConnectionManager()
ws_router = APIRouter()


@ws_router.websocket("/ws/{conversation_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    conversation_id: int,
    user_id: int = Query(...),
    db: Session = Depends(get_db),
) -> None:
    # Import pipeline lazily inside handler to prevent circular references
    from backend.app.pipeline import process_incoming_message

    await manager.connect(websocket, conversation_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({"error": "Invalid JSON format"})
                continue

            event_type = payload.get("type")
            if event_type == "message":
                sender_id = payload.get("sender_id", user_id)
                text = payload.get("text", "")
                if not text or not str(text).strip():
                    continue

                await process_incoming_message(
                    db=db,
                    conversation_id=conversation_id,
                    sender_id=sender_id,
                    text=str(text).strip(),
                )
            else:
                await websocket.send_json({"error": f"Unsupported event type: {event_type}"})

    except WebSocketDisconnect:
        manager.disconnect(websocket, conversation_id)
    except Exception as e:
        logger.exception(f"Unexpected WebSocket error: {e}")
        manager.disconnect(websocket, conversation_id)
