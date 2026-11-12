from contextlib import asynccontextmanager
import os

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.api import assets, auth, dashboard, inventory, locations, movements, notifications, reports, settings as settings_api, tickets, users
from app.core.config import BASE_DIR, settings
from app.core.database import Base, SessionLocal, engine, get_db, normalize_database_url
from app.core.deps import get_user_from_token
from app.core.ws import ws_manager
from app.services.seed import seed_demo_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure storage directories exist
    _ = settings.upload_path
    _ = settings.qr_path
    # Ensure Alembic migrations are tracked & applied on Render deployments
    if os.getenv("RENDER") and "alembic_version" not in inspect(engine).get_table_names():
        from alembic import command
        from alembic.config import Config

        alembic_cfg = Config(str(BASE_DIR / "alembic.ini"))
        alembic_cfg.set_main_option("script_location", str(BASE_DIR / "alembic"))
        command.upgrade(alembic_cfg, "head")
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
def health_check(db: Session = Depends(get_db)):
    dialect = db.bind.dialect.name if db.bind is not None else (
        "postgresql" if normalize_database_url(settings.DATABASE_URL).startswith("postgresql") else "sqlite"
    )
    try:
        db.execute(text("SELECT 1"))
        inspector = inspect(db.get_bind())
        tables = sorted(inspector.get_table_names())
        alembic_rev = None
        if "alembic_version" in tables:
            alembic_rev = db.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={"status": "unhealthy", "service": "cmrl-itam-api", "database": dialect, "database_connected": False},
        ) from exc
    return {
        "status": "healthy",
        "service": "cmrl-itam-api",
        "database": dialect,
        "database_connected": True,
        "tables_count": len(tables),
        "tables": tables,
        "alembic_revision": alembic_rev,
    }


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
