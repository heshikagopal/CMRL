from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.api.serializers import movement_to_out
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.ws import ws_manager
from app.models.asset import Asset
from app.models.core import Location, User
from app.models.enums import InventoryTransactionType, MovementApprovalStatus
from app.models.operations import AssetMovement, InventoryTransaction
from app.schemas.operations import MovementApprovalAction, MovementCreate, MovementOut
from app.services.id_generator import generate_movement_number, generate_transaction_number
from app.services.lifecycle import create_notification, log_audit

router = APIRouter(prefix="/api/movements", tags=["Asset Movements"])


def _resolve_asset(db: Session, ref: str | int) -> Asset:
    q = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.location))
    if isinstance(ref, int) or (isinstance(ref, str) and ref.isdigit()):
        asset = q.filter(Asset.id == int(ref)).first()
    else:
        asset = q.filter(Asset.asset_id == str(ref).strip().upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{ref}' not found")
    return asset


def _load_movement(db: Session, mov_id: int) -> AssetMovement:
    m = (
        db.query(AssetMovement)
        .options(
            joinedload(AssetMovement.asset).joinedload(Asset.category),
            joinedload(AssetMovement.from_location),
            joinedload(AssetMovement.to_location),
            joinedload(AssetMovement.requester),
            joinedload(AssetMovement.approver),
        )
        .filter(AssetMovement.id == mov_id)
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Movement record not found")
    return m


@router.get("", response_model=list[MovementOut])
def list_movements(
    approval_status: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(AssetMovement).options(
        joinedload(AssetMovement.asset).joinedload(Asset.category),
        joinedload(AssetMovement.from_location),
        joinedload(AssetMovement.to_location),
        joinedload(AssetMovement.requester),
        joinedload(AssetMovement.approver),
    )
    if approval_status:
        q = q.filter(AssetMovement.approval_status == approval_status)
    if location_id:
        q = q.filter(or_(AssetMovement.from_location_id == location_id, AssetMovement.to_location_id == location_id))
    if search:
        term = f"%{search.strip()}%"
        q = q.join(AssetMovement.asset).filter(
            or_(
                AssetMovement.movement_number.ilike(term),
                AssetMovement.reason.ilike(term),
                Asset.asset_id.ilike(term),
                Asset.name.ilike(term),
            )
        )
    items = q.order_by(AssetMovement.created_at.desc()).all()
    return [movement_to_out(m) for m in items]


@router.post("", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
def create_movement(
    payload: MovementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    asset = _resolve_asset(db, payload.asset_code_or_id)
    if asset.status == "RETIRED":
        raise HTTPException(status_code=400, detail="Cannot transfer a RETIRED asset")

    to_loc = db.query(Location).filter(Location.id == payload.to_location_id).first()
    if not to_loc:
        raise HTTPException(status_code=400, detail="Destination location not found")
    if to_loc.id == asset.location_id:
        raise HTTPException(status_code=400, detail="Asset is already located at the destination")

    from_loc = asset.location
    role = current_user.role.name.upper()
    is_pending = payload.require_approval or (role != "ADMIN" and payload.require_approval)
    mov_num = generate_movement_number(db)

    mov = AssetMovement(
        movement_number=mov_num,
        asset_id=asset.id,
        from_location_id=from_loc.id,
        to_location_id=to_loc.id,
        transfer_date=payload.transfer_date or date.today(),
        issued_to=payload.issued_to,
        requested_by=current_user.id,
        approved_by=None if is_pending else current_user.id,
        approval_status=MovementApprovalStatus.PENDING.value if is_pending else MovementApprovalStatus.COMPLETED.value,
        reason=payload.reason.strip(),
        remarks=payload.remarks,
    )
    db.add(mov)
    db.flush()

    if not is_pending:
        asset.location_id = to_loc.id
        if payload.issued_to is not None:
            asset.assigned_to_name = payload.issued_to or asset.assigned_to_name
        db.add(
            InventoryTransaction(
                transaction_number=generate_transaction_number(db),
                asset_id=asset.id,
                category_id=asset.category_id,
                location_id=to_loc.id,
                transaction_type=InventoryTransactionType.TRANSFER.value,
                quantity=1,
                issued_to=payload.issued_to,
                performed_by=current_user.id,
                remarks=f"{mov_num}: {from_loc.name} -> {to_loc.name} ({payload.reason})",
            )
        )
        create_notification(
            db,
            title=f"Asset Transferred: {asset.asset_id}",
            message=f"{asset.asset_id} moved from {from_loc.name} to {to_loc.name} ({mov_num}).",
            notification_type="ASSET_TRANSFER",
            severity="INFO",
            entity_type="ASSET",
            entity_id=asset.asset_id,
            target_role="ADMIN",
        )
        log_audit(
            db,
            user=current_user,
            action="ASSET_MOVED",
            entity_type="ASSET",
            entity_id=asset.asset_id,
            summary=f"Asset transferred to {to_loc.name} | {to_loc.name}",
            details={"location": to_loc.name, "from": from_loc.name, "movement": mov_num},
        )
    else:
        create_notification(
            db,
            title=f"Transfer Approval Needed: {mov_num}",
            message=f"{current_user.full_name} requested moving {asset.asset_id} from {from_loc.name} to {to_loc.name}.",
            notification_type="TRANSFER_PENDING",
            severity="INFO",
            entity_type="MOVEMENT",
            entity_id=mov_num,
            target_role="ADMIN",
        )
        log_audit(
            db,
            user=current_user,
            action="MOVEMENT_REQUESTED",
            entity_type="ASSET",
            entity_id=asset.asset_id,
            summary=f"Transfer requested | {to_loc.name}",
            details={"location": to_loc.name, "from": from_loc.name, "movement": mov_num},
        )

    db.commit()
    ws_manager.broadcast_sync("ASSET_MOVED", {"movement_number": mov_num, "asset_id": asset.asset_id, "to_location": to_loc.name})
    return movement_to_out(_load_movement(db, mov.id))


@router.post("/{movement_id}/decision", response_model=MovementOut)
def decide_movement(
    movement_id: int,
    payload: MovementApprovalAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    mov = _load_movement(db, movement_id)
    if mov.approval_status != MovementApprovalStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Movement is already {mov.approval_status}")

    mov.approved_by = current_user.id
    if payload.remarks:
        mov.remarks = f"{mov.remarks or ''}\nDecision note: {payload.remarks}".strip()

    if payload.action == "APPROVE":
        mov.approval_status = MovementApprovalStatus.COMPLETED.value
        mov.asset.location_id = mov.to_location_id
        if mov.issued_to:
            mov.asset.assigned_to_name = mov.issued_to
        db.add(
            InventoryTransaction(
                transaction_number=generate_transaction_number(db),
                asset_id=mov.asset.id,
                category_id=mov.asset.category_id,
                location_id=mov.to_location_id,
                transaction_type=InventoryTransactionType.TRANSFER.value,
                quantity=1,
                issued_to=mov.issued_to,
                performed_by=current_user.id,
                remarks=f"Approved {mov.movement_number}: {mov.from_location.name} -> {mov.to_location.name}",
            )
        )
        log_audit(
            db,
            user=current_user,
            action="ASSET_MOVED",
            entity_type="ASSET",
            entity_id=mov.asset.asset_id,
            summary=f"Transfer approved | {mov.to_location.name}",
            details={"location": mov.to_location.name, "movement": mov.movement_number},
        )
    else:
        mov.approval_status = MovementApprovalStatus.REJECTED.value
        log_audit(
            db,
            user=current_user,
            action="MOVEMENT_REJECTED",
            entity_type="ASSET",
            entity_id=mov.asset.asset_id,
            summary=f"Transfer rejected | {mov.from_location.name}",
            details={"location": mov.from_location.name, "movement": mov.movement_number},
        )

    db.commit()
    ws_manager.broadcast_sync("ASSET_MOVED", {"movement_number": mov.movement_number, "status": mov.approval_status})
    return movement_to_out(_load_movement(db, mov.id))
