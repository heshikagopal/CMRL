import asyncio
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections.discard(websocket)

    async def broadcast(self, event_type: str, data: dict[str, Any] | None = None) -> None:
        payload = json.dumps(
            {
                "type": event_type,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": data or {},
            }
        )
        async with self._lock:
            targets = list(self._connections)

        stale: list[WebSocket] = []
        for ws in targets:
            try:
                await ws.send_text(payload)
            except Exception:
                stale.append(ws)

        if stale:
            async with self._lock:
                for ws in stale:
                    self._connections.discard(ws)

    def broadcast_sync(self, event_type: str, data: dict[str, Any] | None = None) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.broadcast(event_type, data))
        except RuntimeError:
            # Called outside async loop (e.g. unit tests or CLI seed)
            pass


ws_manager = WebSocketManager()
