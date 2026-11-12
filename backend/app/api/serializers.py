from datetime import datetime, timezone

from app.models.asset import Asset
from app.models.core import Location
from app.models.operations import AssetMovement, InventoryTransaction, MaintenanceTicket
from app.schemas.asset import AssetOut
from app.schemas.master import CategoryOut, DepartmentOut, LocationOut, VendorOut
from app.schemas.operations import MovementOut, TicketOut, TicketUpdateOut, InventoryTransactionOut


def asset_to_out(asset: Asset) -> AssetOut:
    return AssetOut(
        id=asset.id,
        asset_id=asset.asset_id,
        name=asset.name,
        category=CategoryOut.model_validate(asset.category),
        manufacturer=asset.manufacturer,
        model=asset.model,
        serial_number=asset.serial_number,
        purchase_date=asset.purchase_date,
        purchase_cost=asset.purchase_cost,
        warranty_start=asset.warranty_start,
        warranty_end=asset.warranty_end,
        vendor=VendorOut.model_validate(asset.vendor) if asset.vendor else None,
        location=location_to_out(asset.location),
        department=DepartmentOut.model_validate(asset.department) if asset.department else None,
        assigned_to_name=asset.assigned_to_name,
        assigned_to_user_id=asset.assigned_to_user_id,
        status=asset.status,
        description=asset.description,
        remarks=asset.remarks,
        qr_code_data=asset.qr_code_data,
        qr_image_url=asset.qr_image_path or f"/api/assets/{asset.asset_id}/qr",
        photo_url=asset.photo_path,
        invoice_url=asset.invoice_path,
        is_archived=asset.is_archived,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
    )


def location_to_out(loc: Location, counts: dict[str, int] | None = None) -> LocationOut:
    c = counts or {}
    return LocationOut(
        id=loc.id,
        location_code=loc.location_code,
        name=loc.name,
        location_type=loc.location_type,
        metro_line=loc.metro_line,
        map_x=loc.map_x,
        map_y=loc.map_y,
        sequence_order=loc.sequence_order,
        address=loc.address,
        description=loc.description,
        is_active=loc.is_active,
        created_at=loc.created_at,
        updated_at=loc.updated_at,
        asset_count=c.get("total", 0),
        working_count=c.get("working", 0),
        faulty_count=c.get("faulty", 0),
        under_repair_count=c.get("under_repair", 0),
        in_store_count=c.get("in_store", 0),
    )


def ticket_to_out(t: MaintenanceTicket) -> TicketOut:
    now = datetime.now(timezone.utc)
    due = t.due_date
    if due and due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    is_overdue = bool(due and due < now and t.status not in {"RESOLVED", "CLOSED"})

    return TicketOut(
        id=t.id,
        ticket_number=t.ticket_number,
        asset_db_id=t.asset.id,
        asset_id=t.asset.asset_id,
        asset_name=t.asset.name,
        asset_category=t.asset.category.name if t.asset.category else "",
        asset_status=t.asset.status,
        location_id=t.location_id,
        location_name=t.location.name if t.location else "",
        fault_category=t.fault_category,
        description=t.description,
        priority=t.priority,
        status=t.status,
        reported_by=t.reported_by,
        reported_by_name=t.reporter.full_name if t.reporter else "System",
        assigned_to=t.assigned_to,
        assigned_to_name=t.technician.full_name if t.technician else None,
        reported_at=t.reported_at,
        due_date=t.due_date,
        resolved_at=t.resolved_at,
        closed_at=t.closed_at,
        resolution_summary=t.resolution_summary,
        remarks=t.remarks,
        supporting_photo_url=t.supporting_photo_path,
        is_overdue=is_overdue,
        updates=[
            TicketUpdateOut(
                id=u.id,
                ticket_id=u.ticket_id,
                updated_by=u.updated_by,
                updated_by_name=u.user.full_name if u.user else "System",
                previous_status=u.previous_status,
                new_status=u.new_status,
                repair_notes=u.repair_notes,
                spare_parts_used=u.spare_parts_used,
                photo_url=u.photo_path,
                created_at=u.created_at,
            )
            for u in (t.updates or [])
        ],
    )


def movement_to_out(m: AssetMovement) -> MovementOut:
    return MovementOut(
        id=m.id,
        movement_number=m.movement_number,
        asset_db_id=m.asset.id,
        asset_id=m.asset.asset_id,
        asset_name=m.asset.name,
        asset_category=m.asset.category.name if m.asset.category else "",
        from_location_id=m.from_location_id,
        from_location_name=m.from_location.name if m.from_location else "",
        to_location_id=m.to_location_id,
        to_location_name=m.to_location.name if m.to_location else "",
        transfer_date=m.transfer_date,
        issued_to=m.issued_to,
        requested_by=m.requested_by,
        requested_by_name=m.requester.full_name if m.requester else "",
        approved_by=m.approved_by,
        approved_by_name=m.approver.full_name if m.approver else None,
        approval_status=m.approval_status,
        reason=m.reason,
        remarks=m.remarks,
        created_at=m.created_at,
    )


def inv_txn_to_out(tx: InventoryTransaction) -> InventoryTransactionOut:
    return InventoryTransactionOut(
        id=tx.id,
        transaction_number=tx.transaction_number,
        asset_db_id=tx.asset.id,
        asset_id=tx.asset.asset_id,
        asset_name=tx.asset.name,
        category_code=tx.category.code if tx.category else "",
        category_name=tx.category.name if tx.category else "",
        location_name=tx.location.name if tx.location else "",
        transaction_type=tx.transaction_type,
        quantity=tx.quantity,
        issued_to=tx.issued_to,
        performed_by_name=tx.performer.full_name if tx.performer else "",
        remarks=tx.remarks,
        created_at=tx.created_at,
    )
