from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.asset import Asset, AuditLog, Notification, StatusHistory
from app.models.core import User
from app.models.enums import AssetStatus

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    AssetStatus.IN_STORE.value: {
        AssetStatus.WORKING.value,
        AssetStatus.NOT_WORKING.value,
        AssetStatus.UNDER_REPAIR.value,
        AssetStatus.RETIRED.value,
        AssetStatus.IN_STORE.value,
    },
    AssetStatus.WORKING.value: {
        AssetStatus.NOT_WORKING.value,
        AssetStatus.IN_STORE.value,
        AssetStatus.UNDER_REPAIR.value,
        AssetStatus.RETIRED.value,
        AssetStatus.WORKING.value,
    },
    AssetStatus.NOT_WORKING.value: {
        AssetStatus.UNDER_REPAIR.value,
        AssetStatus.WORKING.value,
        AssetStatus.IN_STORE.value,
        AssetStatus.RETIRED.value,
        AssetStatus.NOT_WORKING.value,
    },
    AssetStatus.UNDER_REPAIR.value: {
        AssetStatus.WORKING.value,
        AssetStatus.IN_STORE.value,
        AssetStatus.NOT_WORKING.value,
        AssetStatus.RETIRED.value,
        AssetStatus.UNDER_REPAIR.value,
    },
    AssetStatus.RETIRED.value: {
        AssetStatus.RETIRED.value,
    },
}


def validate_status_transition(current_status: str, new_status: str) -> None:
    allowed = ALLOWED_STATUS_TRANSITIONS.get(current_status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid asset lifecycle transition from '{current_status}' to '{new_status}'",
        )


def change_asset_status(
    db: Session,
    asset: Asset,
    new_status: str,
    user: User | None,
    remarks: str,
) -> StatusHistory:
    prev_status = asset.status
    validate_status_transition(prev_status, new_status)

    asset.status = new_status
    history = StatusHistory(
        asset_id=asset.id,
        previous_status=prev_status,
        new_status=new_status,
        changed_by=user.id if user else None,
        remarks=remarks,
    )
    db.add(history)
    return history


def log_audit(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: str,
    summary: str,
    details: dict | None = None,
    ip_address: str | None = None,
) -> AuditLog:
    entry = AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "system",
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        summary=summary[:255],
        details=details or {},
        ip_address=ip_address,
    )
    db.add(entry)
    return entry


def create_notification(
    db: Session,
    title: str,
    message: str,
    notification_type: str,
    severity: str = "INFO",
    entity_type: str | None = None,
    entity_id: str | None = None,
    user_id: int | None = None,
    target_role: str | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        target_role=target_role,
        title=title[:160],
        message=message,
        notification_type=notification_type,
        severity=severity,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notif)
    return notif
