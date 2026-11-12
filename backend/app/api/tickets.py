from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.serializers import ticket_to_out
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.ws import ws_manager
from app.models.asset import Asset, Attachment
from app.models.core import Location, User
from app.models.enums import AssetStatus, TicketPriority, TicketStatus
from app.models.operations import MaintenanceTicket, MaintenanceUpdate
from app.schemas.operations import TicketCreate, TicketOut, TicketUpdateAction
from app.services.id_generator import generate_ticket_number
from app.services.lifecycle import change_asset_status, create_notification, log_audit

router = APIRouter(prefix="/api/tickets", tags=["Fault & Maintenance"])

ALLOWED_PHOTO_EXTS = {".png", ".jpg", ".jpeg", ".webp"}


def _resolve_asset(db: Session, ref: str | int) -> Asset:
    q = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.location))
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        asset = q.filter(Asset.id == int(ref)).first()
    else:
        asset = q.filter(Asset.asset_id == str(ref).strip().upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{ref}' not found")
    return asset


def _load_ticket(db: Session, ticket_ref: str) -> MaintenanceTicket:
    q = db.query(MaintenanceTicket).options(
        joinedload(MaintenanceTicket.asset).joinedload(Asset.category),
        joinedload(MaintenanceTicket.location),
        joinedload(MaintenanceTicket.reporter),
        joinedload(MaintenanceTicket.technician),
        joinedload(MaintenanceTicket.updates).joinedload(MaintenanceUpdate.user),
    )
    if ticket_ref.isdigit():
        tkt = q.filter(MaintenanceTicket.id == int(ticket_ref)).first()
    else:
        tkt = q.filter(MaintenanceTicket.ticket_number == ticket_ref.strip().upper()).first()
    if not tkt:
        raise HTTPException(status_code=404, detail=f"Maintenance ticket '{ticket_ref}' not found")
    return tkt


def _save_ticket_photo(file: UploadFile, subdir: str) -> tuple[str, str, int]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_PHOTO_EXTS:
        raise HTTPException(status_code=400, detail=f"Unsupported image format '{ext}'")
    content = file.file.read()
    if len(content) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Uploaded file exceeds max limit")
    folder = settings.upload_path / subdir
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{ext}"
    (folder / name).write_bytes(content)
    return f"/static/uploads/{subdir}/{name}", file.content_type or "image/jpeg", len(content)


@router.get("")
def list_tickets(
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    assigned_to_me: bool = Query(default=False),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(MaintenanceTicket).options(
        joinedload(MaintenanceTicket.asset).joinedload(Asset.category),
        joinedload(MaintenanceTicket.location),
        joinedload(MaintenanceTicket.reporter),
        joinedload(MaintenanceTicket.technician),
        joinedload(MaintenanceTicket.updates).joinedload(MaintenanceUpdate.user),
    )
    if status_filter:
        q = q.filter(MaintenanceTicket.status == status_filter)
    if priority:
        q = q.filter(MaintenanceTicket.priority == priority)
    if location_id:
        q = q.filter(MaintenanceTicket.location_id == location_id)
    if assigned_to_me:
        q = q.filter(MaintenanceTicket.assigned_to == current_user.id)
    if search:
        term = f"%{search.strip()}%"
        q = q.join(MaintenanceTicket.asset).filter(
            or_(
                MaintenanceTicket.ticket_number.ilike(term),
                MaintenanceTicket.fault_category.ilike(term),
                MaintenanceTicket.description.ilike(term),
                Asset.asset_id.ilike(term),
                Asset.name.ilike(term),
            )
        )

    tickets = q.order_by(MaintenanceTicket.reported_at.desc()).all()
    items = [ticket_to_out(t) for t in tickets]

    # Calculate operational KPIs across all tickets
    all_tickets = db.query(MaintenanceTicket).all()
    now = datetime.now(timezone.utc)
    open_count = sum(1 for t in all_tickets if t.status == TicketStatus.OPEN.value)
    pending_count = sum(
        1 for t in all_tickets if t.status in {TicketStatus.ASSIGNED.value, TicketStatus.IN_PROGRESS.value, TicketStatus.WAITING_SPARE_PARTS.value}
    )
    resolved_list = [t for t in all_tickets if t.status in {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value}]
    overdue_count = 0
    for t in all_tickets:
        due = t.due_date
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due and due < now and t.status not in {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value}:
            overdue_count += 1

    durations_hrs = []
    for t in resolved_list:
        if t.resolved_at and t.reported_at:
            r_at = t.resolved_at.replace(tzinfo=timezone.utc) if t.resolved_at.tzinfo is None else t.resolved_at
            rep_at = t.reported_at.replace(tzinfo=timezone.utc) if t.reported_at.tzinfo is None else t.reported_at
            durations_hrs.append(max(0.1, (r_at - rep_at).total_seconds() / 3600.0))
    avg_resolution_hours = round(sum(durations_hrs) / len(durations_hrs), 1) if durations_hrs else 0.0

    return {
        "items": items,
        "summary": {
            "open_tickets": open_count,
            "pending_tickets": pending_count,
            "resolved_tickets": len(resolved_list),
            "overdue_tickets": overdue_count,
            "avg_resolution_hours": avg_resolution_hours,
        },
    }


@router.get("/technicians")
def list_technicians(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    techs = (
        db.query(User)
        .join(User.role)
        .filter(User.is_active.is_(True), User.role.has(name="TECHNICIAN"))
        .order_by(User.full_name.asc())
        .all()
    )
    return [
        {"id": t.id, "employee_id": t.employee_id, "full_name": t.full_name, "username": t.username}
        for t in techs
    ]


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "TECHNICIAN", "STORE_KEEPER")),
):
    asset = _resolve_asset(db, payload.asset_code_or_id)
    if asset.status == AssetStatus.RETIRED.value:
        raise HTTPException(status_code=400, detail="Cannot report fault against a RETIRED asset")

    loc_id = payload.location_id or asset.location_id
    loc = db.query(Location).filter(Location.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=400, detail="Invalid location")

    ticket_num = generate_ticket_number(db)
    now = datetime.now(timezone.utc)
    sla_hours = 4 if payload.priority == TicketPriority.CRITICAL.value else (12 if payload.priority == TicketPriority.HIGH.value else 48)
    initial_status = TicketStatus.ASSIGNED.value if payload.assigned_to else TicketStatus.OPEN.value

    tkt = MaintenanceTicket(
        ticket_number=ticket_num,
        asset_id=asset.id,
        location_id=loc.id,
        fault_category=payload.fault_category.strip(),
        description=payload.description.strip(),
        priority=payload.priority,
        status=initial_status,
        reported_by=current_user.id,
        assigned_to=payload.assigned_to,
        reported_at=now,
        due_date=now + timedelta(hours=sla_hours),
        remarks=payload.remarks,
    )
    db.add(tkt)
    db.flush()

    db.add(
        MaintenanceUpdate(
            ticket_id=tkt.id,
            updated_by=current_user.id,
            previous_status=None,
            new_status=initial_status,
            repair_notes=f"Fault reported: {payload.description.strip()}",
        )
    )

    if asset.status != AssetStatus.NOT_WORKING.value:
        change_asset_status(
            db,
            asset=asset,
            new_status=AssetStatus.NOT_WORKING.value,
            user=current_user,
            remarks=f"Fault ticket {ticket_num} opened ({payload.priority}): {payload.fault_category}",
        )

    sev = "CRITICAL" if payload.priority == "CRITICAL" else "WARNING"
    create_notification(
        db,
        title=f"{'Critical Fault' if sev == 'CRITICAL' else 'New Fault Ticket'}: {asset.asset_id}",
        message=f"{ticket_num} reported at {loc.name}: {payload.fault_category} ({payload.priority}).",
        notification_type="FAULT_REPORTED",
        severity=sev,
        entity_type="TICKET",
        entity_id=ticket_num,
        target_role="TECHNICIAN",
    )
    if payload.assigned_to:
        create_notification(
            db,
            title=f"Ticket Assigned: {ticket_num}",
            message=f"You have been assigned {ticket_num} for {asset.asset_id} at {loc.name}.",
            notification_type="TICKET_ASSIGNED",
            severity=sev,
            entity_type="TICKET",
            entity_id=ticket_num,
            user_id=payload.assigned_to,
        )

    log_audit(
        db,
        user=current_user,
        action="FAULT_REPORTED",
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=f"Fault reported | {loc.name}",
        details={"location": loc.name, "ticket": ticket_num, "priority": payload.priority},
    )

    db.commit()
    ws_manager.broadcast_sync("TICKET_CREATED", {"ticket_number": ticket_num, "asset_id": asset.asset_id, "priority": payload.priority})
    return ticket_to_out(_load_ticket(db, ticket_num))


@router.post("/{ticket_ref}/photo", response_model=TicketOut)
def upload_ticket_photo(
    ticket_ref: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "TECHNICIAN", "STORE_KEEPER")),
):
    tkt = _load_ticket(db, ticket_ref)
    url, mime, size = _save_ticket_photo(file, "tickets")
    tkt.supporting_photo_path = url
    db.add(
        Attachment(
            entity_type="TICKET_PHOTO",
            entity_id=tkt.id,
            file_name=file.filename or "ticket_photo",
            stored_path=url,
            mime_type=mime,
            file_size=size,
            uploaded_by=current_user.id,
        )
    )
    db.commit()
    return ticket_to_out(_load_ticket(db, tkt.ticket_number))


@router.get("/{ticket_ref}", response_model=TicketOut)
def get_ticket(
    ticket_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return ticket_to_out(_load_ticket(db, ticket_ref))


@router.post("/{ticket_ref}/accept", response_model=TicketOut)
def accept_ticket(
    ticket_ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "TECHNICIAN")),
):
    tkt = _load_ticket(db, ticket_ref)
    prev_tkt_status = tkt.status
    tkt.assigned_to = current_user.id
    if tkt.status in {TicketStatus.OPEN.value, TicketStatus.ASSIGNED.value}:
        tkt.status = TicketStatus.IN_PROGRESS.value

    db.add(
        MaintenanceUpdate(
            ticket_id=tkt.id,
            updated_by=current_user.id,
            previous_status=prev_tkt_status,
            new_status=tkt.status,
            repair_notes=f"Task accepted by {current_user.full_name}. Diagnostics started.",
        )
    )

    if tkt.asset.status == AssetStatus.NOT_WORKING.value:
        change_asset_status(
            db,
            asset=tkt.asset,
            new_status=AssetStatus.UNDER_REPAIR.value,
            user=current_user,
            remarks=f"Maintenance started under {tkt.ticket_number}",
        )

    log_audit(
        db,
        user=current_user,
        action="REPAIR_STARTED",
        entity_type="ASSET",
        entity_id=tkt.asset.asset_id,
        summary=f"Repair started | {tkt.location.name}",
        details={"location": tkt.location.name, "ticket": tkt.ticket_number},
    )
    db.commit()
    ws_manager.broadcast_sync("TICKET_UPDATED", {"ticket_number": tkt.ticket_number, "status": tkt.status})
    return ticket_to_out(_load_ticket(db, tkt.ticket_number))


@router.post("/{ticket_ref}/update", response_model=TicketOut)
def update_ticket_progress(
    ticket_ref: str,
    payload: TicketUpdateAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "TECHNICIAN")),
):
    tkt = _load_ticket(db, ticket_ref)
    prev_status = tkt.status

    if payload.assigned_to is not None:
        tkt.assigned_to = payload.assigned_to
        if payload.assigned_to and not payload.status and tkt.status == TicketStatus.OPEN.value:
            tkt.status = TicketStatus.ASSIGNED.value
        create_notification(
            db,
            title=f"Ticket Assigned: {tkt.ticket_number}",
            message=f"{tkt.ticket_number} ({tkt.asset.asset_id}) assigned to you.",
            notification_type="TICKET_ASSIGNED",
            severity="INFO",
            entity_type="TICKET",
            entity_id=tkt.ticket_number,
            user_id=payload.assigned_to,
        )

    if payload.priority:
        tkt.priority = payload.priority
    if payload.status:
        tkt.status = payload.status
    if payload.resolution_summary:
        tkt.resolution_summary = payload.resolution_summary

    now = datetime.now(timezone.utc)
    if tkt.status == TicketStatus.RESOLVED.value and not tkt.resolved_at:
        tkt.resolved_at = now
        if not tkt.resolution_summary:
            tkt.resolution_summary = payload.repair_notes
    if tkt.status == TicketStatus.CLOSED.value:
        if not tkt.resolved_at:
            tkt.resolved_at = now
        tkt.closed_at = now

    db.add(
        MaintenanceUpdate(
            ticket_id=tkt.id,
            updated_by=current_user.id,
            previous_status=prev_status,
            new_status=tkt.status,
            repair_notes=payload.repair_notes.strip(),
            spare_parts_used=payload.spare_parts_used,
        )
    )

    # Synchronize asset lifecycle status automatically
    target_asset_status = payload.asset_target_status
    if not target_asset_status:
        if tkt.status in {TicketStatus.IN_PROGRESS.value, TicketStatus.WAITING_SPARE_PARTS.value} and tkt.asset.status == AssetStatus.NOT_WORKING.value:
            target_asset_status = AssetStatus.UNDER_REPAIR.value
        elif tkt.status in {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value} and tkt.asset.status in {AssetStatus.NOT_WORKING.value, AssetStatus.UNDER_REPAIR.value}:
            target_asset_status = AssetStatus.WORKING.value

    if target_asset_status and target_asset_status != tkt.asset.status:
        change_asset_status(
            db,
            asset=tkt.asset,
            new_status=target_asset_status,
            user=current_user,
            remarks=f"Ticket {tkt.ticket_number} ({tkt.status}): {payload.repair_notes.strip()}",
        )

    if tkt.status in {TicketStatus.RESOLVED.value, TicketStatus.CLOSED.value}:
        create_notification(
            db,
            title=f"Repair Completed: {tkt.ticket_number}",
            message=f"{tkt.asset.asset_id} repair marked {tkt.status} by {current_user.full_name}.",
            notification_type="REPAIR_COMPLETED",
            severity="INFO",
            entity_type="TICKET",
            entity_id=tkt.ticket_number,
            target_role="ADMIN",
        )
        log_audit(
            db,
            user=current_user,
            action="REPAIR_COMPLETED",
            entity_type="ASSET",
            entity_id=tkt.asset.asset_id,
            summary=f"Repair completed | {tkt.location.name}",
            details={"location": tkt.location.name, "ticket": tkt.ticket_number, "parts": payload.spare_parts_used},
        )
    else:
        log_audit(
            db,
            user=current_user,
            action="REPAIR_UPDATED",
            entity_type="TICKET",
            entity_id=tkt.ticket_number,
            summary=f"Ticket {tkt.status} | {tkt.location.name}",
            details={"location": tkt.location.name, "asset_id": tkt.asset.asset_id},
        )

    db.commit()
    ws_manager.broadcast_sync("TICKET_UPDATED", {"ticket_number": tkt.ticket_number, "asset_id": tkt.asset.asset_id, "status": tkt.status})
    return ticket_to_out(_load_ticket(db, tkt.ticket_number))
