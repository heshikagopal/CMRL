from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.core import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = decode_access_token(token)
        user_id_raw = payload.get("sub")
        if user_id_raw is None:
            raise ValueError("Missing subject")
        user_id = int(user_id_raw)
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = (
        db.query(User)
        .options(joinedload(User.role), joinedload(User.department), joinedload(User.location))
        .filter(User.id == user_id)
        .first()
    )
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive or does not exist",
        )
    return user


def get_user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub"))
        user = (
            db.query(User)
            .options(joinedload(User.role))
            .filter(User.id == user_id, User.is_active.is_(True))
            .first()
        )
        return user
    except Exception:
        return None


def require_roles(*allowed_roles: str) -> Callable[[User], User]:
    allowed_set = {r.upper() for r in allowed_roles}

    def _checker(current_user: User = Depends(get_current_user)) -> User:
        role_name = (current_user.role.name if current_user.role else "").upper()
        if role_name not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{role_name}' does not have permission for this action. Required: {', '.join(sorted(allowed_set))}",
            )
        return current_user

    return _checker
