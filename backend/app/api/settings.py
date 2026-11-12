from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.asset import AuditLog
from app.models.core import SystemSetting, User
from app.schemas.master import SettingOut, SettingsBulkUpdate
from app.services.lifecycle import log_audit

router = APIRouter(prefix="/api/settings", tags=["Settings & Audit"])


@router.get("", response_model=list[SettingOut])
def list_settings(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(SystemSetting).order_by(SystemSetting.category.asc(), SystemSetting.key.asc()).all()
    return [SettingOut.model_validate(r) for r in rows]


@router.put("", response_model=list[SettingOut])
def update_settings(
    payload: SettingsBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    for key, val in payload.settings.items():
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if row:
            row.value = str(val)
        else:
            db.add(SystemSetting(key=key, value=str(val), category="GENERAL"))

    log_audit(
        db,
        user=current_user,
        action="SETTINGS_UPDATED",
        entity_type="SETTINGS",
        entity_id="SYSTEM",
        summary=f"Updated {len(payload.settings)} system settings",
        details={"keys": list(payload.settings.keys())},
    )
    db.commit()
    rows = db.query(SystemSetting).order_by(SystemSetting.category.asc(), SystemSetting.key.asc()).all()
    return [SettingOut.model_validate(r) for r in rows]


@router.get("/audit-logs")
def list_audit_logs(
    limit: int = Query(default=60, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return [
        {
            "id": l.id,
            "username": l.username,
            "action": l.action,
            "entity_type": l.entity_type,
            "entity_id": l.entity_id,
            "summary": l.summary,
            "details": l.details,
            "ip_address": l.ip_address,
            "created_at": l.created_at,
        }
        for l in logs
    ]
