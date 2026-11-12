from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.core import Role, User
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.services.lifecycle import log_audit

router = APIRouter(prefix="/api/users", tags=["User Management"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    users = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .order_by(User.id.asc())
        .all()
    )
    return [UserOut.model_validate(u) for u in users]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    if db.query(User).filter(User.username == payload.username.strip()).first():
        raise HTTPException(status_code=409, detail="Username already exists")
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already exists")
    if db.query(User).filter(User.employee_id == payload.employee_id.strip().upper()).first():
        raise HTTPException(status_code=409, detail="Employee ID already exists")

    role = db.query(Role).filter(Role.id == payload.role_id).first()
    if not role:
        raise HTTPException(status_code=400, detail="Invalid role ID")

    u = User(
        employee_id=payload.employee_id.strip().upper(),
        full_name=payload.full_name.strip(),
        username=payload.username.strip(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        phone=payload.phone,
        role_id=role.id,
        department_id=payload.department_id,
        location_id=payload.location_id,
        is_active=payload.is_active,
    )
    db.add(u)
    log_audit(
        db,
        user=current_user,
        action="USER_CREATED",
        entity_type="USER",
        entity_id=u.employee_id,
        summary=f"Created user {u.username} ({role.name})",
    )
    db.commit()
    created = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .filter(User.id == u.id)
        .first()
    )
    return UserOut.model_validate(created)


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    u = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .filter(User.id == user_id)
        .first()
    )
    if not u:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.full_name is not None:
        u.full_name = payload.full_name.strip()
    if payload.email is not None:
        u.email = payload.email.lower()
    if payload.phone is not None:
        u.phone = payload.phone
    if payload.role_id is not None:
        role = db.query(Role).filter(Role.id == payload.role_id).first()
        if not role:
            raise HTTPException(status_code=400, detail="Invalid role")
        u.role_id = role.id
    if payload.department_id is not None:
        u.department_id = payload.department_id
    if payload.location_id is not None:
        u.location_id = payload.location_id
    if payload.is_active is not None:
        if u.id == current_user.id and not payload.is_active:
            raise HTTPException(status_code=400, detail="Cannot deactivate your own active session")
        u.is_active = payload.is_active
    if payload.password:
        u.password_hash = hash_password(payload.password)

    log_audit(
        db,
        user=current_user,
        action="USER_UPDATED",
        entity_type="USER",
        entity_id=u.employee_id,
        summary=f"Updated user account {u.username}",
    )
    db.commit()
    db.refresh(u)
    reloaded = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .filter(User.id == u.id)
        .first()
    )
    return UserOut.model_validate(reloaded)
