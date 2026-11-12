from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.models.core import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut
from app.services.lifecycle import log_audit

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    identifier = payload.username.strip()
    user = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .filter(or_(User.username == identifier, User.email == identifier))
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is disabled. Contact CMRL IT Administrator.",
        )

    user.last_login_at = datetime.now(timezone.utc)
    log_audit(
        db,
        user=user,
        action="USER_LOGIN",
        entity_type="USER",
        entity_id=user.employee_id,
        summary=f"User {user.username} logged into CMRL ITAM",
        ip_address=request.client.host if request.client else None,
    )
    db.commit()
    db.refresh(user)

    token = create_access_token(
        subject=str(user.id),
        extra_claims={"role": user.role.name, "username": user.username},
    )
    return TokenResponse(
        access_token=token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserOut.model_validate(user),
    )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)
