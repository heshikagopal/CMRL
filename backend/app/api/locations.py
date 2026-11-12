from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.serializers import location_to_out
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.ws import ws_manager
from app.models.asset import Asset, AssetCategory
from app.models.core import Department, Location, Role, User, Vendor
from app.schemas.master import CategoryOut, DepartmentOut, LocationCreate, LocationOut, LocationUpdate, RoleOut, VendorOut
from app.services.lifecycle import log_audit

router = APIRouter(prefix="/api", tags=["Locations & Master Data"])


@router.get("/locations", response_model=list[LocationOut])
def list_locations(
    location_type: str | None = Query(default=None),
    metro_line: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Location)
    if not include_inactive:
        q = q.filter(Location.is_active.is_(True))
    if location_type:
        q = q.filter(Location.location_type == location_type)
    if metro_line:
        q = q.filter(Location.metro_line == metro_line)

    locs = q.order_by(Location.sequence_order.asc(), Location.name.asc()).all()
    assets = db.query(Asset).filter(Asset.is_archived.is_(False)).all()

    counts_map: dict[int, dict[str, int]] = {}
    for a in assets:
        entry = counts_map.setdefault(a.location_id, {"total": 0, "working": 0, "faulty": 0, "under_repair": 0, "in_store": 0})
        entry["total"] += 1
        if a.status == "WORKING":
            entry["working"] += 1
        elif a.status == "NOT_WORKING":
            entry["faulty"] += 1
        elif a.status == "UNDER_REPAIR":
            entry["under_repair"] += 1
        elif a.status == "IN_STORE":
            entry["in_store"] += 1

    return [location_to_out(loc, counts_map.get(loc.id)) for loc in locs]


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    code = payload.location_code.strip().upper()
    if db.query(Location).filter(Location.location_code == code).first():
        raise HTTPException(status_code=409, detail=f"Location code '{code}' already exists")
    if db.query(Location).filter(Location.name == payload.name.strip()).first():
        raise HTTPException(status_code=409, detail=f"Location name '{payload.name}' already exists")

    loc = Location(
        location_code=code,
        name=payload.name.strip(),
        location_type=payload.location_type,
        metro_line=payload.metro_line,
        map_x=payload.map_x,
        map_y=payload.map_y,
        sequence_order=payload.sequence_order,
        address=payload.address,
        description=payload.description,
        is_active=payload.is_active,
    )
    db.add(loc)
    log_audit(
        db,
        user=current_user,
        action="LOCATION_CREATED",
        entity_type="LOCATION",
        entity_id=code,
        summary=f"Location created: {loc.name}",
        details={"location": loc.name, "type": loc.location_type},
    )
    db.commit()
    db.refresh(loc)
    ws_manager.broadcast_sync("LOCATION_UPDATED", {"location_code": code})
    return location_to_out(loc)


@router.put("/locations/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")

    for field in ["name", "location_type", "metro_line", "map_x", "map_y", "sequence_order", "address", "description", "is_active"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(loc, field, val.strip() if isinstance(val, str) else val)

    log_audit(
        db,
        user=current_user,
        action="LOCATION_UPDATED",
        entity_type="LOCATION",
        entity_id=loc.location_code,
        summary=f"Location updated: {loc.name}",
        details={"location": loc.name},
    )
    db.commit()
    db.refresh(loc)
    ws_manager.broadcast_sync("LOCATION_UPDATED", {"location_code": loc.location_code})
    return location_to_out(loc)


@router.get("/master/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [CategoryOut.model_validate(c) for c in db.query(AssetCategory).order_by(AssetCategory.name.asc()).all()]


@router.get("/master/departments", response_model=list[DepartmentOut])
def list_departments(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [DepartmentOut.model_validate(d) for d in db.query(Department).order_by(Department.name.asc()).all()]


@router.get("/master/vendors", response_model=list[VendorOut])
def list_vendors(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [VendorOut.model_validate(v) for v in db.query(Vendor).order_by(Vendor.name.asc()).all()]


@router.get("/master/roles", response_model=list[RoleOut])
def list_roles(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [RoleOut.model_validate(r) for r in db.query(Role).order_by(Role.id.asc()).all()]
