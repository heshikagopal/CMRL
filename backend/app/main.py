from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import assets, auth, dashboard, inventory, locations, movements, notifications, reports, settings as settings_api, tickets, users
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.core.deps import get_user_from_token
from app.core.ws import ws_manager
from app.services.seed import seed_demo_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure storage directories exist
    _ = settings.upload_path
    _ = settings.qr_path
    # Ensure tables exist if running directly without external alembic invocation
    Base.metadata.create_all(bind=engine)
    if settings.AUTO_SEED_DEMO:
        db = SessionLocal()
        try:
            seed_demo_data(db)
        finally:
            db.close()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Chennai Metro Rail Limited (CMRL) IT Asset Management & Monitoring Prototype",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static storage for QR images and uploaded attachments
app.mount("/static/uploads", StaticFiles(directory=str(settings.upload_path)), name="uploads")
app.mount("/static/qrcodes", StaticFiles(directory=str(settings.qr_path)), name="qrcodes")

# Register API routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(assets.router)
app.include_router(tickets.router)
app.include_router(movements.router)
app.include_router(inventory.router)
app.include_router(locations.router)
app.include_router(reports.router)
app.include_router(users.router)
app.include_router(notifications.router)
app.include_router(settings_api.router)


@app.get("/api/health")
def health_check():
    db_type = "postgresql" if settings.DATABASE_URL.startswith("postgres") else "sqlite"
    return {"status": "healthy", "service": "cmrl-itam-api", "database": db_type}


@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket, token: str | None = Query(default=None)):
    if token:
        db = SessionLocal()
        try:
            user = get_user_from_token(token, db)
        finally:
            db.close()
        if not user:
            await websocket.close(code=1008)
            return
    else:
        await websocket.close(code=1008)
        return

    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive; echo ping/pong if client sends heartbeat
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text('{"type":"PONG"}')
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)
