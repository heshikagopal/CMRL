from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.asset import Asset, AssetCategory, AuditLog
from app.models.core import Location, User
from app.models.operations import MaintenanceTicket
from app.schemas.dashboard import (
    ActivityTickerItem,
    DashboardCounters,
    DashboardResponse,
    StationAssetMini,
    StationCategoryBreakdown,
    StationDetailPanel,
    StationNodeSummary,
    StationTicketMini,
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard & Metro Monitor"])


def _compute_node_summary(
    loc: Location,
    loc_assets: list[Asset],
    loc_tickets: list[MaintenanceTicket],
    today: date,
) -> StationNodeSummary:
    total = len(loc_assets)
    working = sum(1 for a in loc_assets if a.status == "WORKING")
    not_working = sum(1 for a in loc_assets if a.status == "NOT_WORKING")
    under_repair = sum(1 for a in loc_assets if a.status == "UNDER_REPAIR")
    in_store = sum(1 for a in loc_assets if a.status == "IN_STORE")
    retired = sum(1 for a in loc_assets if a.status == "RETIRED")

    open_tkts = [t for t in loc_tickets if t.status not in {"RESOLVED", "CLOSED"}]
    crit_tkts = [t for t in open_tkts if t.priority == "CRITICAL"]
    exp_30d = sum(
        1
        for a in loc_assets
        if a.warranty_end is not None and a.status != "RETIRED" and a.warranty_end <= today + timedelta(days=30)
    )

    if total == 0:
        health = "GREY"
    elif len(crit_tkts) > 0 or not_working >= 2 or (not_working >= 1 and total <= 3):
        health = "RED"
    elif not_working > 0 or under_repair > 0 or len(open_tkts) > 0:
        health = "AMBER"
    else:
        health = "GREEN"

    fault_density_pct = round(((not_working + under_repair) / total) * 100.0, 1) if total > 0 else 0.0

    return StationNodeSummary(
        location_id=loc.id,
        location_code=loc.location_code,
        name=loc.name,
        location_type=loc.location_type,
        metro_line=loc.metro_line,
        map_x=loc.map_x,
        map_y=loc.map_y,
        sequence_order=loc.sequence_order,
        total_assets=total,
        working_count=working,
        not_working_count=not_working,
        under_repair_count=under_repair,
        in_store_count=in_store,
        retired_count=retired,
        open_tickets_count=len(open_tkts),
        critical_tickets_count=len(crit_tkts),
        expiring_warranty_count=exp_30d,
        health_status=health,
        fault_density_pct=fault_density_pct,
    )


@router.get("/monitor", response_model=DashboardResponse)
def get_network_monitor(
    metro_line: str | None = Query(default=None),
    location_id: int | None = Query(default=None),
    location_type: str | None = Query(default=None),
    category_id: int | None = Query(default=None),
    status: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    now = datetime.now(timezone.utc)

    locations = (
        db.query(Location)
        .filter(Location.is_active.is_(True))
        .order_by(Location.sequence_order.asc(), Location.name.asc())
        .all()
    )

    asset_query = db.query(Asset).options(joinedload(Asset.category), joinedload(Asset.location)).filter(
        Asset.is_archived.is_(False)
    )
    if category_id:
        asset_query = asset_query.filter(Asset.category_id == category_id)
    if status:
        asset_query = asset_query.filter(Asset.status == status)
    if location_id:
        asset_query = asset_query.filter(Asset.location_id == location_id)
    if date_from:
        asset_query = asset_query.filter(Asset.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        asset_query = asset_query.filter(Asset.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=timezone.utc))

    filtered_assets = asset_query.all()

    # Apply location-level filters for metro_line / location_type
    valid_loc_ids = set()
    for loc in locations:
        if metro_line and metro_line != "ALL":
            if metro_line in {"BLUE", "GREEN"} and loc.metro_line not in {metro_line, "INTERCHANGE"}:
                continue
            if metro_line not in {"BLUE", "GREEN"} and loc.metro_line != metro_line:
                continue
        if location_type and location_type != "ALL" and loc.location_type != location_type:
            continue
        if location_id and loc.id != location_id:
            continue
        valid_loc_ids.add(loc.id)

    scoped_assets = [a for a in filtered_assets if a.location_id in valid_loc_ids]

    all_tickets = db.query(MaintenanceTicket).all()
    tickets_by_loc: dict[int, list[MaintenanceTicket]] = {}
    for t in all_tickets:
        tickets_by_loc.setdefault(t.location_id, []).append(t)

    assets_by_loc: dict[int, list[Asset]] = {}
    for a in scoped_assets:
        assets_by_loc.setdefault(a.location_id, []).append(a)

    # Return all active map locations so schematic topology stays intact; non-matching locations show 0/GREY when filtered
    nodes: list[StationNodeSummary] = []
    for loc in locations:
        loc_assets = assets_by_loc.get(loc.id, []) if loc.id in valid_loc_ids else []
        loc_tkts = tickets_by_loc.get(loc.id, []) if loc.id in valid_loc_ids else []
        nodes.append(_compute_node_summary(loc, loc_assets, loc_tkts, today))

    # Global counters from scoped assets
    open_tickets_list = [
        t for t in all_tickets if t.status not in {"RESOLVED", "CLOSED"} and t.location_id in valid_loc_ids
    ]
    overdue_count = 0
    for t in open_tickets_list:
        due = t.due_date
        if due and due.tzinfo is None:
            due = due.replace(tzinfo=timezone.utc)
        if due and due < now:
            overdue_count += 1

    # Low stock check across categories
    categories = db.query(AssetCategory).filter(AssetCategory.is_active.is_(True)).all()
    all_store_assets = db.query(Asset).filter(Asset.is_archived.is_(False), Asset.status == "IN_STORE").all()
    store_by_cat: dict[int, int] = {}
    for sa in all_store_assets:
        store_by_cat[sa.category_id] = store_by_cat.get(sa.category_id, 0) + 1
    low_stock_cats = sum(1 for c in categories if store_by_cat.get(c.id, 0) <= c.low_stock_threshold)

    counters = DashboardCounters(
        total_assets=len(scoped_assets),
        working=sum(1 for a in scoped_assets if a.status == "WORKING"),
        not_working=sum(1 for a in scoped_assets if a.status == "NOT_WORKING"),
        in_store=sum(1 for a in scoped_assets if a.status == "IN_STORE"),
        under_repair=sum(1 for a in scoped_assets if a.status == "UNDER_REPAIR"),
        retired=sum(1 for a in scoped_assets if a.status == "RETIRED"),
        open_tickets=len(open_tickets_list),
        overdue_tickets=overdue_count,
        expiring_warranty_30d=sum(
            1
            for a in scoped_assets
            if a.warranty_end is not None and a.status != "RETIRED" and a.warranty_end <= today + timedelta(days=30)
        ),
        low_stock_categories=low_stock_cats,
    )

    # Recent activity ticker from real audit_logs
    recent_logs = (
        db.query(AuditLog)
        .filter(AuditLog.entity_type.in_(["ASSET", "TICKET", "MOVEMENT", "INVENTORY"]))
        .order_by(AuditLog.created_at.desc())
        .limit(18)
        .all()
    )
    ticker: list[ActivityTickerItem] = []
    for log in recent_logs:
        loc_name = (log.details or {}).get("location", "Nandanam HQ")
        sev = "CRITICAL" if "FAULT" in log.action or "CRITICAL" in log.action else "INFO"
        if "REPAIR" in log.action or "PENDING" in log.action:
            sev = "WARNING"
        ts = log.created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        local_ts = ts.astimezone(timezone(timedelta(hours=5, minutes=30)))
        ticker.append(
            ActivityTickerItem(
                id=log.id,
                asset_id=log.entity_id,
                event_label=log.summary.split("|")[0].strip(),
                location_name=loc_name,
                timestamp=ts,
                time_display=local_ts.strftime("%I:%M %p"),
                severity=sev,
            )
        )

    return DashboardResponse(counters=counters, nodes=nodes, ticker=ticker)


@router.get("/stations/{location_id}", response_model=StationDetailPanel)
def get_station_detail_panel(
    location_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    today = date.today()
    loc_assets = (
        db.query(Asset)
        .options(joinedload(Asset.category))
        .filter(Asset.location_id == location_id, Asset.is_archived.is_(False))
        .order_by(Asset.asset_id.asc())
        .all()
    )
    loc_tickets = (
        db.query(MaintenanceTicket)
        .options(joinedload(MaintenanceTicket.asset))
        .filter(MaintenanceTicket.location_id == location_id)
        .order_by(MaintenanceTicket.reported_at.desc())
        .limit(8)
        .all()
    )

    node = _compute_node_summary(loc, loc_assets, loc_tickets, today)

    cat_counts: dict[tuple[str, str], int] = {}
    for a in loc_assets:
        key = (a.category.code, a.category.name)
        cat_counts[key] = cat_counts.get(key, 0) + 1

    breakdown = [
        StationCategoryBreakdown(category_code=k[0], category_name=k[1], count=v)
        for k, v in sorted(cat_counts.items(), key=lambda x: -x[1])
    ]

    recent_tkt_minis = [
        StationTicketMini(
            id=t.id,
            ticket_number=t.ticket_number,
            asset_id=t.asset.asset_id if t.asset else "",
            fault_category=t.fault_category,
            priority=t.priority,
            status=t.status,
            reported_at=t.reported_at,
        )
        for t in loc_tickets
    ]

    asset_minis = [
        StationAssetMini(
            id=a.id,
            asset_id=a.asset_id,
            name=a.name,
            category_code=a.category.code,
            category_name=a.category.name,
            status=a.status,
            assigned_to_name=a.assigned_to_name,
            warranty_end=a.warranty_end.isoformat() if a.warranty_end else None,
        )
        for a in loc_assets
    ]

    return StationDetailPanel(
        node=node,
        category_breakdown=breakdown,
        recent_tickets=recent_tkt_minis,
        assets=asset_minis,
    )


@router.get("/search")
def global_search(
    q: str = Query(..., min_length=1, max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    term = f"%{q.strip()}%"
    matched_assets = (
        db.query(Asset)
        .options(joinedload(Asset.location), joinedload(Asset.category))
        .filter(
            Asset.is_archived.is_(False),
            or_(
                Asset.asset_id.ilike(term),
                Asset.name.ilike(term),
                Asset.serial_number.ilike(term),
                Asset.model.ilike(term),
                Asset.assigned_to_name.ilike(term),
            ),
        )
        .limit(8)
        .all()
    )
    matched_tickets = (
        db.query(MaintenanceTicket)
        .options(joinedload(MaintenanceTicket.asset))
        .filter(
            or_(
                MaintenanceTicket.ticket_number.ilike(term),
                MaintenanceTicket.fault_category.ilike(term),
                MaintenanceTicket.description.ilike(term),
            )
        )
        .limit(5)
        .all()
    )
    matched_locations = (
        db.query(Location)
        .filter(Location.is_active.is_(True), or_(Location.name.ilike(term), Location.location_code.ilike(term)))
        .limit(5)
        .all()
    )
    return {
        "assets": [
            {
                "id": a.id,
                "asset_id": a.asset_id,
                "name": a.name,
                "status": a.status,
                "location": a.location.name if a.location else "",
                "category": a.category.code if a.category else "",
            }
            for a in matched_assets
        ],
        "tickets": [
            {
                "id": t.id,
                "ticket_number": t.ticket_number,
                "asset_id": t.asset.asset_id if t.asset else "",
                "priority": t.priority,
                "status": t.status,
            }
            for t in matched_tickets
        ],
        "locations": [
            {"id": l.id, "location_code": l.location_code, "name": l.name, "location_type": l.location_type}
            for l in matched_locations
        ],
    }
