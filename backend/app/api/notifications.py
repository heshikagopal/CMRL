from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.asset import Asset, AssetCategory, Notification
from app.models.core import User
from app.models.operations import MaintenanceTicket
from app.schemas.dashboard import NotificationOut
from app.services.lifecycle import create_notification

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])


@router.get("")
def list_notifications(
    unread_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_name = current_user.role.name.upper() if current_user.role else ""
    q = db.query(Notification)
    if role_name != "ADMIN":
        q = q.filter(
            or_(
                Notification.user_id == current_user.id,
                Notification.target_role == role_name,
                (Notification.user_id.is_(None) & Notification.target_role.is_(None)),
            )
        )
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))

    items = q.order_by(Notification.created_at.desc()).limit(50).all()

    unread_q = db.query(Notification).filter(Notification.is_read.is_(False))
    if role_name != "ADMIN":
        unread_q = unread_q.filter(
            or_(
                Notification.user_id == current_user.id,
                Notification.target_role == role_name,
                (Notification.user_id.is_(None) & Notification.target_role.is_(None)),
            )
        )
    unread_count = unread_q.count()

    return {
        "items": [NotificationOut.model_validate(n) for n in items],
        "unread_count": unread_count,
    }


@router.post("/{notif_id}/read")
def mark_notification_read(
    notif_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    notif = db.query(Notification).filter(Notification.id == notif_id).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    db.commit()
    return {"message": "Marked as read"}


@router.post("/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role_name = current_user.role.name.upper() if current_user.role else ""
    q = db.query(Notification).filter(Notification.is_read.is_(False))
    if role_name != "ADMIN":
        q = q.filter(
            or_(
                Notification.user_id == current_user.id,
                Notification.target_role == role_name,
                (Notification.user_id.is_(None) & Notification.target_role.is_(None)),
            )
        )
    for n in q.all():
        n.is_read = True
    db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/scan-alerts")
def scan_system_alerts(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN", "STORE_KEEPER", "TECHNICIAN")),
):
    today = date.today()
    now = datetime.now(timezone.utc)
    created_count = 0

    # Check expiring warranties in 30 days
    exp_assets = (
        db.query(Asset)
        .filter(
            Asset.is_archived.is_(False),
            Asset.status != "RETIRED",
            Asset.warranty_end.is_not(None),
            Asset.warranty_end <= today + timedelta(days=30),
        )
        .all()
    )
    if exp_assets:
        existing = (
            db.query(Notification)
            .filter(Notification.notification_type == "WARRANTY_EXPIRY", Notification.is_read.is_(False))
            .first()
        )
        if not existing:
            create_notification(
                db,
                title=f"Warranty Scan: {len(exp_assets)} Asset(s) Expiring <=30d",
                message=f"Assets requiring warranty renewal review: {', '.join(a.asset_id for a in exp_assets[:4])}.",
                notification_type="WARRANTY_EXPIRY",
                severity="WARNING",
                entity_type="REPORT",
                entity_id="warranty_expiry",
                target_role="ADMIN",
            )
            created_count += 1

    # Check overdue tickets
    overdue_tkts = []
    for t in db.query(MaintenanceTicket).filter(MaintenanceTicket.status.notin_(["RESOLVED", "CLOSED"])).all():
        due = t.due_date
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due and due < now:
            overdue_tkts.append(t)

    if overdue_tkts:
        existing_od = (
            db.query(Notification)
            .filter(Notification.notification_type == "OVERDUE_TICKET", Notification.is_read.is_(False))
            .first()
        )
        if not existing_od:
            create_notification(
                db,
                title=f"Overdue Maintenance Scan: {len(overdue_tkts)} Ticket(s)",
                message=f"Overdue tickets: {', '.join(t.ticket_number for t in overdue_tkts[:4])}.",
                notification_type="OVERDUE_TICKET",
                severity="CRITICAL",
                entity_type="TICKET",
                entity_id=overdue_tkts[0].ticket_number,
                target_role="TECHNICIAN",
            )
            created_count += 1

    # Check low stock
    cats = db.query(AssetCategory).filter(AssetCategory.is_active.is_(True)).all()
    low_cats = []
    for c in cats:
        cnt = db.query(Asset).filter(Asset.category_id == c.id, Asset.status == "IN_STORE", Asset.is_archived.is_(False)).count()
        if cnt <= c.low_stock_threshold:
            low_cats.append(c.code)
    if low_cats:
        existing_ls = (
            db.query(Notification)
            .filter(Notification.notification_type == "LOW_STOCK", Notification.is_read.is_(False))
            .first()
        )
        if not existing_ls:
            create_notification(
                db,
                title=f"Low Store Stock Scan: {', '.join(low_cats[:4])}",
                message=f"Categories below buffer threshold: {', '.join(low_cats)}.",
                notification_type="LOW_STOCK",
                severity="WARNING",
                entity_type="INVENTORY",
                entity_id="STR-CEN",
                target_role="STORE_KEEPER",
            )
            created_count += 1

    db.commit()
    return {"alerts_generated": created_count}
