from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.asset import Asset, AssetCategory
from app.models.core import Location, User
from app.models.operations import AssetMovement, MaintenanceTicket
from app.schemas.dashboard import AnalyticsResponse
from app.services.export_service import export_csv_bytes, export_excel_bytes, export_pdf_bytes

router = APIRouter(prefix="/api/reports", tags=["Reports & Analytics"])

REPORT_DEFINITIONS = {
    "asset_register": "Total Asset Register (Nandanam HQ)",
    "asset_status": "Asset Status Report",
    "station_wise": "Floor / Zone-wise Asset Report (Nandanam HQ)",
    "category_wise": "Category-wise Asset Report",
    "fault_maintenance": "Fault and Maintenance Report",
    "asset_movement": "Asset Movement Report",
    "warranty_expiry": "Warranty Expiry Report",
    "spare_inventory": "Spare Inventory Report",
    "retired_assets": "Retired Asset Report",
}


def _build_report_dataset(
    db: Session,
    report_type: str,
    location_id: int | None = None,
    category_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[str, list[str], list[list[Any]]]:
    if report_type not in REPORT_DEFINITIONS:
        raise HTTPException(status_code=400, detail=f"Unknown report type '{report_type}'")

    title = REPORT_DEFINITIONS[report_type]
    today = date.today()

    assets_q = db.query(Asset).options(
        joinedload(Asset.category),
        joinedload(Asset.location),
        joinedload(Asset.department),
        joinedload(Asset.vendor),
    ).filter(Asset.is_archived.is_(False))
    if location_id:
        assets_q = assets_q.filter(Asset.location_id == location_id)
    if category_id:
        assets_q = assets_q.filter(Asset.category_id == category_id)
    if date_from:
        assets_q = assets_q.filter(Asset.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        assets_q = assets_q.filter(Asset.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))
    assets = assets_q.order_by(Asset.asset_id.asc()).all()

    if report_type == "asset_register":
        headers = ["Asset ID", "Name", "Category", "Manufacturer", "Model", "Serial No", "Location", "Assigned To", "Status", "Warranty End"]
        rows = [
            [
                a.asset_id, a.name, a.category.name if a.category else "", a.manufacturer, a.model,
                a.serial_number, a.location.name if a.location else "", a.assigned_to_name or "-",
                a.status, a.warranty_end.isoformat() if a.warranty_end else "-",
            ]
            for a in assets
        ]
        return title, headers, rows

    if report_type == "asset_status":
        headers = ["Status", "Asset Count", "Percentage", "Asset IDs (Sample)"]
        total = max(len(assets), 1)
        by_status: dict[str, list[Asset]] = {}
        for a in assets:
            by_status.setdefault(a.status, []).append(a)
        rows = [
            [st, len(items), f"{round(len(items) * 100 / total, 1)}%", ", ".join(x.asset_id for x in items[:5])]
            for st, items in sorted(by_status.items())
        ]
        return title, headers, rows

    if report_type == "station_wise":
        headers = ["Zone Code", "Nandanam HQ Floor / Zone", "Facility Type", "Total", "Working", "Not Working", "Under Repair", "In Store"]
        locs = db.query(Location).filter(Location.is_active.is_(True)).order_by(Location.sequence_order.asc()).all()
        rows = []
        for l in locs:
            if location_id and l.id != location_id:
                continue
            la = [a for a in assets if a.location_id == l.id]
            rows.append([
                l.location_code, l.name, l.location_type.replace("_", " "), len(la),
                sum(1 for a in la if a.status == "WORKING"),
                sum(1 for a in la if a.status == "NOT_WORKING"),
                sum(1 for a in la if a.status == "UNDER_REPAIR"),
                sum(1 for a in la if a.status == "IN_STORE"),
            ])
        return title, headers, rows

    if report_type == "category_wise":
        headers = ["Category Code", "Category Name", "Total", "Working", "In Store", "Faulty / Repair", "Retired"]
        cats = db.query(AssetCategory).order_by(AssetCategory.name.asc()).all()
        rows = []
        for c in cats:
            if category_id and c.id != category_id:
                continue
            ca = [a for a in assets if a.category_id == c.id]
            rows.append([
                c.code, c.name, len(ca),
                sum(1 for a in ca if a.status == "WORKING"),
                sum(1 for a in ca if a.status == "IN_STORE"),
                sum(1 for a in ca if a.status in {"NOT_WORKING", "UNDER_REPAIR"}),
                sum(1 for a in ca if a.status == "RETIRED"),
            ])
        return title, headers, rows

    if report_type == "fault_maintenance":
        tq = db.query(MaintenanceTicket).options(
            joinedload(MaintenanceTicket.asset).joinedload(Asset.category),
            joinedload(MaintenanceTicket.location),
            joinedload(MaintenanceTicket.technician),
        )
        if location_id:
            tq = tq.filter(MaintenanceTicket.location_id == location_id)
        if date_from:
            tq = tq.filter(MaintenanceTicket.reported_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
        if date_to:
            tq = tq.filter(MaintenanceTicket.reported_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))
        tickets = tq.order_by(MaintenanceTicket.reported_at.desc()).all()
        if category_id:
            tickets = [t for t in tickets if t.asset and t.asset.category_id == category_id]
        headers = ["Ticket No", "Asset ID", "Asset Name", "Location", "Fault Category", "Priority", "Status", "Technician", "Reported Date"]
        rows = [
            [
                t.ticket_number,
                t.asset.asset_id if t.asset else "",
                t.asset.name if t.asset else "",
                t.location.name if t.location else "",
                t.fault_category,
                t.priority,
                t.status,
                t.technician.full_name if t.technician else "Unassigned",
                t.reported_at.strftime("%Y-%m-%d %H:%M"),
            ]
            for t in tickets
        ]
        return title, headers, rows

    if report_type == "asset_movement":
        mq = db.query(AssetMovement).options(
            joinedload(AssetMovement.asset),
            joinedload(AssetMovement.from_location),
            joinedload(AssetMovement.to_location),
            joinedload(AssetMovement.requester),
        )
        if location_id:
            mq = mq.filter((AssetMovement.from_location_id == location_id) | (AssetMovement.to_location_id == location_id))
        if date_from:
            mq = mq.filter(AssetMovement.transfer_date >= date_from)
        if date_to:
            mq = mq.filter(AssetMovement.transfer_date <= date_to)
        movs = mq.order_by(AssetMovement.transfer_date.desc()).all()
        if category_id:
            movs = [m for m in movs if m.asset and m.asset.category_id == category_id]
        headers = ["Movement No", "Asset ID", "Asset Name", "From", "To", "Transfer Date", "Issued To", "Approval", "Reason"]
        rows = [
            [
                m.movement_number,
                m.asset.asset_id if m.asset else "",
                m.asset.name if m.asset else "",
                m.from_location.name if m.from_location else "",
                m.to_location.name if m.to_location else "",
                m.transfer_date.isoformat(),
                m.issued_to or "-",
                m.approval_status,
                m.reason,
            ]
            for m in movs
        ]
        return title, headers, rows

    if report_type == "warranty_expiry":
        headers = ["Asset ID", "Asset Name", "Category", "Location", "Vendor", "Warranty End", "Days Remaining", "Warranty State"]
        rows = []
        for a in sorted([x for x in assets if x.warranty_end is not None], key=lambda x: x.warranty_end):
            days_left = (a.warranty_end - today).days
            state = "EXPIRED" if days_left < 0 else ("EXPIRING_30D" if days_left <= 30 else ("EXPIRING_90D" if days_left <= 90 else "VALID"))
            rows.append([
                a.asset_id, a.name, a.category.name if a.category else "",
                a.location.name if a.location else "", a.vendor.name if a.vendor else "-",
                a.warranty_end.isoformat(), days_left, state,
            ])
        return title, headers, rows

    if report_type == "spare_inventory":
        headers = ["Asset ID", "Asset Name", "Category", "Manufacturer", "Model", "Serial No", "Store Location", "Warranty End"]
        spares = [a for a in assets if a.status == "IN_STORE"]
        rows = [
            [
                a.asset_id, a.name, a.category.name if a.category else "",
                a.manufacturer, a.model, a.serial_number,
                a.location.name if a.location else "", a.warranty_end.isoformat() if a.warranty_end else "-",
            ]
            for a in spares
        ]
        return title, headers, rows

    # retired_assets
    headers = ["Asset ID", "Asset Name", "Category", "Manufacturer", "Model", "Serial No", "Last Location", "Purchase Date", "Remarks"]
    retired = [a for a in assets if a.status == "RETIRED"]
    rows = [
        [
            a.asset_id, a.name, a.category.name if a.category else "",
            a.manufacturer, a.model, a.serial_number,
            a.location.name if a.location else "",
            a.purchase_date.isoformat() if a.purchase_date else "-",
            a.remarks or "-",
        ]
        for a in retired
    ]
    return title, headers, rows


@router.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(
    location_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    aq = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.location)).filter(Asset.is_archived.is_(False))
    if location_id:
        aq = aq.filter(Asset.location_id == location_id)
    if category_id:
        aq = aq.filter(Asset.category_id == category_id)
    assets = aq.all()

    status_counts: dict[str, int] = {}
    for st in ["WORKING", "NOT_WORKING", "IN_STORE", "UNDER_REPAIR", "RETIRED"]:
        status_counts[st] = sum(1 for a in assets if a.status == st)
    status_dist = [{"name": k.replace("_", " "), "status": k, "value": v} for k, v in status_counts.items()]

    cat_map: dict[str, int] = {}
    for a in assets:
        cname = a.category.name if a.category else "Other"
        cat_map[cname] = cat_map.get(cname, 0) + 1
    cat_dist = [{"name": k, "count": v} for k, v in sorted(cat_map.items(), key=lambda x: -x[1])]

    loc_map: dict[str, dict[str, Any]] = {}
    for a in assets:
        lname = a.location.name if a.location else "Unknown"
        row = loc_map.setdefault(lname, {"name": lname, "working": 0, "faulty": 0, "total": 0})
        row["total"] += 1
        if a.status == "WORKING":
            row["working"] += 1
        elif a.status in {"NOT_WORKING", "UNDER_REPAIR"}:
            row["faulty"] += 1
    station_dist = sorted(loc_map.values(), key=lambda x: -x["total"])[:12]

    # Monthly fault & resolution trends (last 6 months from tickets)
    tq = db.query(MaintenanceTicket)
    if location_id:
        tq = tq.filter(MaintenanceTicket.location_id == location_id)
    tickets = tq.all()
    if category_id:
        tickets = [t for t in tickets if t.asset and t.asset.category_id == category_id]

    months: list[tuple[str, int, int]] = []
    for offset in range(5, -1, -1):
        m_date = (today.replace(day=1) - timedelta(days=offset * 28)).replace(day=1)
        label = m_date.strftime("%b %Y")
        ym = (m_date.year, m_date.month)
        reported_c = sum(1 for t in tickets if (t.reported_at.year, t.reported_at.month) == ym)
        resolved_c = sum(1 for t in tickets if t.resolved_at and (t.resolved_at.year, t.resolved_at.month) == ym)
        months.append((label, reported_c, resolved_c))
    # Deduplicate month labels if 28-day step landed twice in same month
    seen_m = set()
    monthly_trends = []
    for label, rep_c, res_c in months:
        if label not in seen_m:
            seen_m.add(label)
            monthly_trends.append({"month": label, "reported": rep_c, "resolved": res_c})

    # Warranty overview
    expired_c = sum(1 for a in assets if a.warranty_end and a.warranty_end < today and a.status != "RETIRED")
    exp_30_c = sum(1 for a in assets if a.warranty_end and today <= a.warranty_end <= today + timedelta(days=30) and a.status != "RETIRED")
    exp_90_c = sum(1 for a in assets if a.warranty_end and today + timedelta(days=30) < a.warranty_end <= today + timedelta(days=90) and a.status != "RETIRED")
    valid_c = sum(1 for a in assets if a.warranty_end and a.warranty_end > today + timedelta(days=90) and a.status != "RETIRED")
    warranty_overview = [
        {"bucket": "Expired", "count": expired_c},
        {"bucket": "Expiring <=30d", "count": exp_30_c},
        {"bucket": "Expiring 31-90d", "count": exp_90_c},
        {"bucket": "Active >90d", "count": valid_c},
    ]

    resolved_tkts = [t for t in tickets if t.resolved_at and t.reported_at]
    avg_hrs = 0.0
    if resolved_tkts:
        avg_hrs = round(
            sum(
                max(0.1, ((t.resolved_at.replace(tzinfo=timezone.utc) if t.resolved_at.tzinfo is None else t.resolved_at) - (t.reported_at.replace(tzinfo=timezone.utc) if t.reported_at.tzinfo is None else t.reported_at)).total_seconds() / 3600.0)
                for t in resolved_tkts
            )
            / len(resolved_tkts),
            1,
        )

    return AnalyticsResponse(
        status_distribution=status_dist,
        category_distribution=cat_dist,
        station_distribution=station_dist,
        monthly_fault_trends=monthly_trends,
        warranty_overview=warranty_overview,
        ticket_metrics={
            "total": len(tickets),
            "open": sum(1 for t in tickets if t.status in {"OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_SPARE_PARTS"}),
            "resolved": sum(1 for t in tickets if t.status in {"RESOLVED", "CLOSED"}),
            "avg_resolution_hours": avg_hrs,
        },
    )


@router.get("/preview")
def preview_report(
    report_type: str = Query(...),
    location_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    title, headers, rows = _build_report_dataset(db, report_type, location_id, category_id, date_from, date_to)
    return {"report_type": report_type, "title": title, "headers": headers, "rows": rows, "total_rows": len(rows)}


@router.get("/export")
def export_report(
    report_type: str = Query(...),
    format: str = Query(default="csv", pattern=r"^(csv|xlsx|pdf)$"),
    location_id: int | None = Query(default=None),
    category_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    title, headers, rows = _build_report_dataset(db, report_type, location_id, category_id, date_from, date_to)
    slug = report_type.lower()

    if format == "xlsx":
        content = export_excel_bytes(title, headers, rows)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="cmrl_{slug}.xlsx"'},
        )
    if format == "pdf":
        content = export_pdf_bytes(title, headers, rows)
        return Response(
            content=content,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="cmrl_{slug}.pdf"'},
        )
    content = export_csv_bytes(headers, rows)
    return Response(
        content=content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="cmrl_{slug}.csv"'},
    )
