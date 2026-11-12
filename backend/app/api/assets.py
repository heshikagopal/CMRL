import math
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy import asc, desc, or_
from sqlalchemy.orm import Session, joinedload

from app.api.serializers import asset_to_out, movement_to_out, ticket_to_out
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.ws import ws_manager
from app.models.asset import Asset, AssetCategory, Attachment, StatusHistory
from app.models.core import Location, User
from app.models.enums import AssetStatus, InventoryTransactionType
from app.models.operations import AssetMovement, InventoryTransaction, MaintenanceTicket
from app.schemas.asset import (
    AssetCreate,
    AssetJourneyEvent,
    AssetListResponse,
    AssetOut,
    AssetStatusChange,
    AssetUpdate,
    StatusHistoryOut,
)
from app.services.export_service import export_csv_bytes, export_excel_bytes
from app.services.id_generator import generate_asset_id, generate_transaction_number
from app.services.lifecycle import change_asset_status, create_notification, log_audit
from app.services.qr_service import build_qr_payload, ensure_asset_qr_file, generate_qr_bytes

router = APIRouter(prefix="/api/assets", tags=["Assets & QR"])

ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
ALLOWED_DOC_EXTS = {".pdf", ".png", ".jpg", ".jpeg"}


def _lookup_asset(db: Session, asset_ref: str) -> Asset:
    query = db.query(Asset).options(
        joinedload(Asset.category),
        joinedload(Asset.vendor),
        joinedload(Asset.location),
        joinedload(Asset.department),
    )
    if asset_ref.isdigit():
        asset = query.filter(Asset.id == int(asset_ref)).first()
    else:
        asset = query.filter(Asset.asset_id == asset_ref.strip().upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_ref}' not found")
    return asset


def _save_upload(file: UploadFile, allowed_exts: set[str], subdir: str) -> tuple[str, str, int]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(allowed_exts))}",
        )
    content = file.file.read()
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

    folder = settings.upload_path / subdir
    folder.mkdir(parents=True, exist_ok=True)
    safe_name = f"{uuid4().hex}{ext}"
    target = folder / safe_name
    target.write_bytes(content)
    return f"/static/uploads/{subdir}/{safe_name}", file.content_type or "application/octet-stream", len(content)


@router.get("", response_model=AssetListResponse)
def list_assets(
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    department_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    warranty_expiring_days: int | None = Query(default=None),
    include_archived: bool = Query(default=False),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Asset).options(
        joinedload(Asset.category),
        joinedload(Asset.vendor),
        joinedload(Asset.location),
        joinedload(Asset.department),
    )
    if not include_archived:
        query = query.filter(Asset.is_archived.is_(False))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Asset.asset_id.ilike(term),
                Asset.name.ilike(term),
                Asset.serial_number.ilike(term),
                Asset.manufacturer.ilike(term),
                Asset.model.ilike(term),
                Asset.assigned_to_name.ilike(term),
            )
        )
    if category_id:
        query = query.filter(Asset.category_id == category_id)
    if location_id:
        query = query.filter(Asset.location_id == location_id)
    if department_id:
        query = query.filter(Asset.department_id == department_id)
    if status_filter:
        query = query.filter(Asset.status == status_filter)
    if warranty_expiring_days is not None:
        cutoff = date.today() + timedelta(days=warranty_expiring_days)
        query = query.filter(Asset.warranty_end.is_not(None), Asset.warranty_end <= cutoff, Asset.status != "RETIRED")

    sort_map = {
        "asset_id": Asset.asset_id,
        "name": Asset.name,
        "status": Asset.status,
        "warranty_end": Asset.warranty_end,
        "created_at": Asset.created_at,
        "updated_at": Asset.updated_at,
    }
    sort_col = sort_map.get(sort_by, Asset.created_at)
    query = query.order_by(asc(sort_col) if sort_dir.lower() == "asc" else desc(sort_col))

    total = query.count()
    total_pages = max(1, math.ceil(total / page_size))
    items = query.offset((page - 1) * page_size).limit(page_size).all()

    return AssetListResponse(
        items=[asset_to_out(a) for a in items],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/export")
def export_assets(
    format: str = Query(default="csv", pattern=r"^(csv|xlsx)$"),
    search: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query = db.query(Asset).options(
        joinedload(Asset.category),
        joinedload(Asset.location),
        joinedload(Asset.vendor),
        joinedload(Asset.department),
    ).filter(Asset.is_archived.is_(False))
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Asset.asset_id.ilike(term), Asset.name.ilike(term), Asset.serial_number.ilike(term)))
    if category_id:
        query = query.filter(Asset.category_id == category_id)
    if location_id:
        query = query.filter(Asset.location_id == location_id)
    if status_filter:
        query = query.filter(Asset.status == status_filter)

    assets = query.order_by(Asset.asset_id.asc()).all()
    headers = [
        "Asset ID", "Asset Name", "Category", "Manufacturer", "Model",
        "Serial Number", "Location", "Department", "Assigned To", "Status", "Warranty End",
    ]
    rows = [
        [
            a.asset_id,
            a.name,
            a.category.name if a.category else "",
            a.manufacturer,
            a.model,
            a.serial_number,
            a.location.name if a.location else "",
            a.department.name if a.department else "",
            a.assigned_to_name or "",
            a.status,
            a.warranty_end.isoformat() if a.warranty_end else "",
        ]
        for a in assets
    ]
    if format == "xlsx":
        data = export_excel_bytes("IT Asset Register", headers, rows)
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="cmrl_assets.xlsx"'},
        )
    data = export_csv_bytes(headers, rows)
    return Response(
        content=data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="cmrl_assets.csv"'},
    )


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def register_asset(
    payload: AssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    category = db.query(AssetCategory).filter(AssetCategory.id == payload.category_id).first()
    if not category:
        raise HTTPException(status_code=400, detail="Invalid asset category")

    location = db.query(Location).filter(Location.id == payload.location_id).first()
    if not location:
        raise HTTPException(status_code=400, detail="Invalid location")

    dup_sn = db.query(Asset).filter(Asset.serial_number == payload.serial_number.strip()).first()
    if dup_sn:
        raise HTTPException(
            status_code=409,
            detail=f"Serial number '{payload.serial_number}' is already registered under {dup_sn.asset_id}",
        )

    permanent_asset_id = generate_asset_id(db, category.code)
    qr_payload = build_qr_payload(permanent_asset_id)
    qr_image_url = ensure_asset_qr_file(permanent_asset_id, category.code)

    asset = Asset(
        asset_id=permanent_asset_id,
        name=payload.name.strip(),
        category_id=category.id,
        manufacturer=payload.manufacturer.strip(),
        model=payload.model.strip(),
        serial_number=payload.serial_number.strip(),
        purchase_date=payload.purchase_date,
        purchase_cost=payload.purchase_cost,
        warranty_start=payload.warranty_start,
        warranty_end=payload.warranty_end,
        vendor_id=payload.vendor_id,
        location_id=location.id,
        department_id=payload.department_id,
        assigned_to_name=payload.assigned_to_name,
        assigned_to_user_id=payload.assigned_to_user_id,
        status=AssetStatus.IN_STORE.value,
        description=payload.description,
        remarks=payload.remarks,
        qr_code_data=qr_payload,
        qr_image_path=qr_image_url,
        created_by=current_user.id,
    )
    db.add(asset)
    db.flush()

    db.add(
        StatusHistory(
            asset_id=asset.id,
            previous_status=None,
            new_status=AssetStatus.IN_STORE.value,
            changed_by=current_user.id,
            remarks=f"Asset registered into CMRL ITAM at {location.name}",
        )
    )
    db.add(
        InventoryTransaction(
            transaction_number=generate_transaction_number(db),
            asset_id=asset.id,
            category_id=category.id,
            location_id=location.id,
            transaction_type=InventoryTransactionType.STOCK_IN.value,
            quantity=1,
            issued_to=payload.assigned_to_name,
            performed_by=current_user.id,
            remarks="Initial registration stock-in",
        )
    )
    log_audit(
        db,
        user=current_user,
        action="ASSET_REGISTERED",
        entity_type="ASSET",
        entity_id=permanent_asset_id,
        summary=f"Asset registered | {location.name}",
        details={"location": location.name, "category": category.code, "name": asset.name},
    )
    if payload.warranty_end and payload.warranty_end <= date.today() + timedelta(days=30):
        create_notification(
            db,
            title=f"Warranty Expiring Soon: {permanent_asset_id}",
            message=f"{asset.name} ({permanent_asset_id}) warranty ends on {payload.warranty_end.isoformat()}.",
            notification_type="WARRANTY_EXPIRY",
            severity="WARNING",
            entity_type="ASSET",
            entity_id=permanent_asset_id,
            target_role="ADMIN",
        )

    db.commit()
    ws_manager.broadcast_sync("ASSET_REGISTERED", {"asset_id": permanent_asset_id, "location": location.name})

    created = _lookup_asset(db, permanent_asset_id)
    return asset_to_out(created)


@router.post("/{asset_ref}/attachments")
def upload_asset_attachments(
    asset_ref: str,
    photo: UploadFile | None = File(default=None),
    invoice: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    asset = _lookup_asset(db, asset_ref)
    updated_fields: list[str] = []

    if photo:
        url, mime, size = _save_upload(photo, ALLOWED_IMAGE_EXTS, "assets")
        asset.photo_path = url
        db.add(
            Attachment(
                entity_type="ASSET_PHOTO",
                entity_id=asset.id,
                file_name=photo.filename or "photo",
                stored_path=url,
                mime_type=mime,
                file_size=size,
                uploaded_by=current_user.id,
            )
        )
        updated_fields.append("photo")

    if invoice:
        url, mime, size = _save_upload(invoice, ALLOWED_DOC_EXTS, "invoices")
        asset.invoice_path = url
        db.add(
            Attachment(
                entity_type="ASSET_INVOICE",
                entity_id=asset.id,
                file_name=invoice.filename or "invoice",
                stored_path=url,
                mime_type=mime,
                file_size=size,
                uploaded_by=current_user.id,
            )
        )
        updated_fields.append("invoice")

    if not updated_fields:
        raise HTTPException(status_code=400, detail="No valid file uploaded")

    log_audit(
        db,
        user=current_user,
        action="ASSET_ATTACHMENT_UPLOADED",
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=f"Attachments uploaded ({', '.join(updated_fields)}) | {asset.location.name}",
        details={"location": asset.location.name, "files": updated_fields},
    )
    db.commit()
    return asset_to_out(_lookup_asset(db, asset.asset_id))


@router.get("/{asset_ref}/detail")
def get_asset_detail(
    asset_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asset = _lookup_asset(db, asset_ref)

    status_hist = (
        db.query(StatusHistory)
        .options(joinedload(StatusHistory.user))
        .filter(StatusHistory.asset_id == asset.id)
        .order_by(StatusHistory.changed_at.asc())
        .all()
    )
    tickets = (
        db.query(MaintenanceTicket)
        .options(
            joinedload(MaintenanceTicket.asset).joinedload(Asset.category),
            joinedload(MaintenanceTicket.location),
            joinedload(MaintenanceTicket.reporter),
            joinedload(MaintenanceTicket.technician),
            joinedload(MaintenanceTicket.updates),
        )
        .filter(MaintenanceTicket.asset_id == asset.id)
        .order_by(MaintenanceTicket.reported_at.desc())
        .all()
    )
    movements = (
        db.query(AssetMovement)
        .options(
            joinedload(AssetMovement.asset).joinedload(Asset.category),
            joinedload(AssetMovement.from_location),
            joinedload(AssetMovement.to_location),
            joinedload(AssetMovement.requester),
            joinedload(AssetMovement.approver),
        )
        .filter(AssetMovement.asset_id == asset.id)
        .order_by(AssetMovement.created_at.desc())
        .all()
    )
    attachments = (
        db.query(Attachment)
        .filter(Attachment.entity_id == asset.id, Attachment.entity_type.in_(["ASSET_PHOTO", "ASSET_INVOICE"]))
        .order_by(Attachment.created_at.desc())
        .all()
    )

    journey: list[AssetJourneyEvent] = []
    for sh in status_hist:
        label = "Registered (In Store)" if sh.previous_status is None else f"{sh.previous_status.replace('_', ' ')} -> {sh.new_status.replace('_', ' ')}"
        journey.append(
            AssetJourneyEvent(
                id=f"sh-{sh.id}",
                event_type="STATUS",
                title=label,
                subtitle=sh.new_status,
                timestamp=sh.changed_at,
                actor_name=sh.user.full_name if sh.user else "System",
                status=sh.new_status,
                remarks=sh.remarks,
            )
        )
    for mv in movements:
        journey.append(
            AssetJourneyEvent(
                id=f"mv-{mv.id}",
                event_type="MOVEMENT",
                title=f"Transferred: {mv.from_location.name} -> {mv.to_location.name}",
                subtitle=f"{mv.movement_number} ({mv.approval_status})",
                timestamp=mv.created_at,
                actor_name=mv.requester.full_name if mv.requester else "System",
                status=mv.approval_status,
                remarks=mv.reason,
            )
        )
    for tkt in tickets:
        journey.append(
            AssetJourneyEvent(
                id=f"tkt-{tkt.id}",
                event_type="TICKET",
                title=f"Ticket {tkt.ticket_number}: {tkt.fault_category}",
                subtitle=f"Priority: {tkt.priority} | Status: {tkt.status}",
                timestamp=tkt.reported_at,
                actor_name=tkt.reporter.full_name if tkt.reporter else "System",
                status=tkt.status,
                remarks=tkt.description,
            )
        )

    journey.sort(key=lambda e: e.timestamp.replace(tzinfo=timezone.utc) if e.timestamp.tzinfo is None else e.timestamp)

    return {
        "asset": asset_to_out(asset),
        "status_history": [
            StatusHistoryOut(
                id=sh.id,
                previous_status=sh.previous_status,
                new_status=sh.new_status,
                changed_by=sh.changed_by,
                changed_by_name=sh.user.full_name if sh.user else "System",
                remarks=sh.remarks,
                changed_at=sh.changed_at,
            )
            for sh in reversed(status_hist)
        ],
        "tickets": [ticket_to_out(t) for t in tickets],
        "movements": [movement_to_out(m) for m in movements],
        "attachments": [
            {
                "id": att.id,
                "entity_type": att.entity_type,
                "file_name": att.file_name,
                "url": att.stored_path,
                "mime_type": att.mime_type,
                "file_size": att.file_size,
                "created_at": att.created_at,
            }
            for att in attachments
        ],
        "journey": journey,
    }


@router.get("/{asset_ref}", response_model=AssetOut)
def get_asset(
    asset_ref: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return asset_to_out(_lookup_asset(db, asset_ref))


@router.put("/{asset_ref}", response_model=AssetOut)
def update_asset(
    asset_ref: str,
    payload: AssetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    asset = _lookup_asset(db, asset_ref)
    if payload.serial_number and payload.serial_number.strip() != asset.serial_number:
        dup = db.query(Asset).filter(Asset.serial_number == payload.serial_number.strip(), Asset.id != asset.id).first()
        if dup:
            raise HTTPException(status_code=409, detail=f"Serial number already used by {dup.asset_id}")

    for field in [
        "name", "manufacturer", "model", "serial_number", "purchase_date",
        "purchase_cost", "warranty_start", "warranty_end", "vendor_id",
        "department_id", "assigned_to_name", "assigned_to_user_id", "description", "remarks",
    ]:
        val = getattr(payload, field)
        if val is not None:
            setattr(asset, field, val.strip() if isinstance(val, str) else val)

    log_audit(
        db,
        user=current_user,
        action="ASSET_UPDATED",
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=f"Asset metadata updated | {asset.location.name}",
        details={"location": asset.location.name},
    )
    db.commit()
    ws_manager.broadcast_sync("ASSET_UPDATED", {"asset_id": asset.asset_id})
    return asset_to_out(_lookup_asset(db, asset.asset_id))


@router.post("/{asset_ref}/status", response_model=AssetOut)
def update_asset_status(
    asset_ref: str,
    payload: AssetStatusChange,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "TECHNICIAN", "STORE_KEEPER")),
):
    asset = _lookup_asset(db, asset_ref)

    # Role-specific guardrails
    role = current_user.role.name.upper()
    if role == "TECHNICIAN" and payload.new_status == "RETIRED" and asset.status != "UNDER_REPAIR":
        raise HTTPException(status_code=403, detail="Technicians can retire assets only after repair assessment (UNDER_REPAIR)")

    if payload.location_id:
        loc = db.query(Location).filter(Location.id == payload.location_id).first()
        if not loc:
            raise HTTPException(status_code=400, detail="Target location not found")
        asset.location_id = loc.id

    if payload.assigned_to_name is not None:
        asset.assigned_to_name = payload.assigned_to_name or None

    change_asset_status(db, asset, payload.new_status, current_user, payload.remarks)

    loc_name = asset.location.name if asset.location else "CMRL"
    log_audit(
        db,
        user=current_user,
        action="STATUS_CHANGED",
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=f"Status {payload.new_status} | {loc_name}",
        details={"location": loc_name, "new_status": payload.new_status, "remarks": payload.remarks},
    )
    db.commit()
    ws_manager.broadcast_sync("ASSET_STATUS_CHANGED", {"asset_id": asset.asset_id, "status": payload.new_status})
    return asset_to_out(_lookup_asset(db, asset.asset_id))


@router.get("/{asset_ref}/qr")
def get_asset_qr_png(
    asset_ref: str,
    label: bool = Query(default=True),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    asset = _lookup_asset(db, asset_ref)
    cat_code = asset.category.code if asset.category else "IT"
    png_bytes = generate_qr_bytes(asset.asset_id, category_code=cat_code, include_label=label)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Content-Disposition": f'inline; filename="{asset.asset_id}-qr.png"'},
    )


@router.delete("/{asset_ref}", status_code=status.HTTP_200_OK)
def archive_asset(
    asset_ref: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    asset = _lookup_asset(db, asset_ref)
    asset.is_archived = True
    log_audit(
        db,
        user=current_user,
        action="ASSET_ARCHIVED",
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=f"Asset archived | {asset.location.name}",
        details={"location": asset.location.name},
    )
    db.commit()
    ws_manager.broadcast_sync("ASSET_ARCHIVED", {"asset_id": asset.asset_id})
    return {"message": f"Asset {asset.asset_id} archived successfully"}
