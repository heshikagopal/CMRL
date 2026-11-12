from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.api.serializers import asset_to_out, inv_txn_to_out
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.ws import ws_manager
from app.models.asset import Asset, AssetCategory
from app.models.core import Location, User
from app.models.enums import AssetStatus, InventoryTransactionType, MovementApprovalStatus
from app.models.operations import AssetMovement, InventoryTransaction
from app.schemas.master import CategoryOut, CategoryThresholdUpdate
from app.schemas.operations import (
    InventoryCategorySummary,
    InventoryIssueReturnRequest,
    InventoryTransactionOut,
)
from app.services.id_generator import generate_movement_number, generate_transaction_number
from app.services.lifecycle import change_asset_status, create_notification, log_audit

router = APIRouter(prefix="/api/inventory", tags=["Inventory & Store"])


@router.get("/summary")
def get_inventory_summary(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    categories = db.query(AssetCategory).filter(AssetCategory.is_active.is_(True)).order_by(AssetCategory.name.asc()).all()
    assets = (
        db.query(Asset)
        .options(joinedload(Asset.category), joinedload(Asset.location), joinedload(Asset.vendor), joinedload(Asset.department))
        .filter(Asset.is_archived.is_(False))
        .all()
    )

    cat_summary: list[InventoryCategorySummary] = []
    for cat in categories:
        cat_assets = [a for a in assets if a.category_id == cat.id]
        in_store = sum(1 for a in cat_assets if a.status == AssetStatus.IN_STORE.value)
        cat_summary.append(
            InventoryCategorySummary(
                category_id=cat.id,
                code=cat.code,
                name=cat.name,
                total_assets=len(cat_assets),
                in_store_count=in_store,
                working_count=sum(1 for a in cat_assets if a.status == AssetStatus.WORKING.value),
                under_repair_count=sum(1 for a in cat_assets if a.status == AssetStatus.UNDER_REPAIR.value),
                not_working_count=sum(1 for a in cat_assets if a.status == AssetStatus.NOT_WORKING.value),
                low_stock_threshold=cat.low_stock_threshold,
                is_low_stock=in_store <= cat.low_stock_threshold,
            )
        )

    spare_assets = [asset_to_out(a) for a in assets if a.status == AssetStatus.IN_STORE.value]
    issued_assets = [asset_to_out(a) for a in assets if a.status in {AssetStatus.WORKING.value, AssetStatus.UNDER_REPAIR.value}]

    recent_txns = (
        db.query(InventoryTransaction)
        .options(
            joinedload(InventoryTransaction.asset),
            joinedload(InventoryTransaction.category),
            joinedload(InventoryTransaction.location),
            joinedload(InventoryTransaction.performer),
        )
        .order_by(InventoryTransaction.created_at.desc())
        .limit(35)
        .all()
    )

    return {
        "categories": cat_summary,
        "spare_assets": spare_assets,
        "deployed_assets": issued_assets,
        "transactions": [inv_txn_to_out(t) for t in recent_txns],
    }


@router.post("/issue-return")
def issue_or_return_asset(
    payload: InventoryIssueReturnRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    q = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.location), joinedload(Asset.vendor), joinedload(Asset.department))
    ref = payload.asset_code_or_id
    asset = q.filter(Asset.id == int(ref)).first() if (isinstance(ref, int) or str(ref).isdigit()) else q.filter(Asset.asset_id == str(ref).strip().upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{ref}' not found")

    target_loc = db.query(Location).filter(Location.id == payload.target_location_id).first()
    if not target_loc:
        raise HTTPException(status_code=400, detail="Target location not found")

    prev_loc = asset.location

    if payload.action == "ISSUE":
        if asset.status != AssetStatus.IN_STORE.value:
            raise HTTPException(status_code=400, detail=f"Only IN_STORE assets can be issued (current status: {asset.status})")
        if not payload.issued_to:
            raise HTTPException(status_code=400, detail="Please specify employee/desk to issue the asset to")

        asset.location_id = target_loc.id
        asset.assigned_to_name = payload.issued_to.strip()
        change_asset_status(
            db,
            asset=asset,
            new_status=AssetStatus.WORKING.value,
            user=current_user,
            remarks=payload.remarks or f"Issued from store to {target_loc.name} ({payload.issued_to})",
        )
        txn_type = InventoryTransactionType.ISSUE.value
        mov_reason = f"Issued from store to {payload.issued_to}"
        audit_action = "ASSET_ISSUED"
        audit_summary = f"Asset issued | {target_loc.name}"
    else:
        if asset.status == AssetStatus.RETIRED.value:
            raise HTTPException(status_code=400, detail="RETIRED assets cannot be returned to active spare store")
        asset.location_id = target_loc.id
        asset.assigned_to_name = None
        change_asset_status(
            db,
            asset=asset,
            new_status=AssetStatus.IN_STORE.value,
            user=current_user,
            remarks=payload.remarks or f"Returned to store at {target_loc.name}",
        )
        txn_type = InventoryTransactionType.RETURN.value
        mov_reason = f"Returned to store ({target_loc.name})"
        audit_action = "ASSET_RETURNED"
        audit_summary = f"Asset returned | {target_loc.name}"

    if prev_loc.id != target_loc.id:
        db.add(
            AssetMovement(
                movement_number=generate_movement_number(db),
                asset_id=asset.id,
                from_location_id=prev_loc.id,
                to_location_id=target_loc.id,
                transfer_date=date.today(),
                issued_to=payload.issued_to,
                requested_by=current_user.id,
                approved_by=current_user.id,
                approval_status=MovementApprovalStatus.COMPLETED.value,
                reason=mov_reason,
                remarks=payload.remarks,
            )
        )

    db.add(
        InventoryTransaction(
            transaction_number=generate_transaction_number(db),
            asset_id=asset.id,
            category_id=asset.category_id,
            location_id=target_loc.id,
            transaction_type=txn_type,
            quantity=1,
            issued_to=payload.issued_to,
            performed_by=current_user.id,
            remarks=payload.remarks or mov_reason,
        )
    )

    # Check low stock after issue
    if payload.action == "ISSUE":
        remaining_in_store = (
            db.query(Asset)
            .filter(Asset.category_id == asset.category_id, Asset.status == AssetStatus.IN_STORE.value, Asset.is_archived.is_(False))
            .count()
        )
        if remaining_in_store <= asset.category.low_stock_threshold:
            create_notification(
                db,
                title=f"Low Spare Stock: {asset.category.name}",
                message=f"Only {remaining_in_store} {asset.category.name} spare(s) left in store (threshold: {asset.category.low_stock_threshold}).",
                notification_type="LOW_STOCK",
                severity="WARNING",
                entity_type="CATEGORY",
                entity_id=asset.category.code,
                target_role="STORE_KEEPER",
            )

    log_audit(
        db,
        user=current_user,
        action=audit_action,
        entity_type="ASSET",
        entity_id=asset.asset_id,
        summary=audit_summary,
        details={"location": target_loc.name, "issued_to": payload.issued_to},
    )
    db.commit()
    ws_manager.broadcast_sync("INVENTORY_UPDATED", {"asset_id": asset.asset_id, "action": payload.action})
    return {"message": f"Asset {asset.asset_id} {payload.action.lower()} completed", "asset": asset_to_out(asset)}


@router.patch("/categories/{category_id}/threshold", response_model=CategoryOut)
def update_low_stock_threshold(
    category_id: int,
    payload: CategoryThresholdUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "STORE_KEEPER")),
):
    cat = db.query(AssetCategory).filter(AssetCategory.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.low_stock_threshold = payload.low_stock_threshold
    log_audit(
        db,
        user=current_user,
        action="THRESHOLD_UPDATED",
        entity_type="CATEGORY",
        entity_id=cat.code,
        summary=f"Low stock threshold set to {payload.low_stock_threshold} for {cat.name}",
    )
    db.commit()
    db.refresh(cat)
    return CategoryOut.model_validate(cat)
