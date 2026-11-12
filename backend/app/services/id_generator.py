import re
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import Asset
from app.models.operations import AssetMovement, InventoryTransaction, MaintenanceTicket


def _extract_max_seq(values: list[str], prefix: str) -> int:
    max_num = 0
    pattern = re.compile(rf"^{re.escape(prefix)}(\d+)$")
    for val in values:
        m = pattern.match(val)
        if m:
            num = int(m.group(1))
            if num > max_num:
                max_num = num
    return max_num


def generate_asset_id(db: Session, category_code: str) -> str:
    clean_code = category_code.strip().upper()
    prefix = f"CMRL-IT-{clean_code}-"
    existing = db.scalars(select(Asset.asset_id).where(Asset.asset_id.like(f"{prefix}%"))).all()
    next_seq = _extract_max_seq(list(existing), prefix) + 1
    return f"{prefix}{next_seq:04d}"


def generate_ticket_number(db: Session) -> str:
    prefix = "CMRL-TKT-"
    existing = db.scalars(select(MaintenanceTicket.ticket_number).where(MaintenanceTicket.ticket_number.like(f"{prefix}%"))).all()
    next_seq = _extract_max_seq(list(existing), prefix) + 1
    return f"{prefix}{next_seq:04d}"


def generate_movement_number(db: Session) -> str:
    prefix = "CMRL-MOV-"
    existing = db.scalars(select(AssetMovement.movement_number).where(AssetMovement.movement_number.like(f"{prefix}%"))).all()
    next_seq = _extract_max_seq(list(existing), prefix) + 1
    return f"{prefix}{next_seq:04d}"


def generate_transaction_number(db: Session) -> str:
    prefix = "CMRL-TXN-"
    existing = db.scalars(
        select(InventoryTransaction.transaction_number).where(InventoryTransaction.transaction_number.like(f"{prefix}%"))
    ).all()
    next_seq = _extract_max_seq(list(existing), prefix) + 1
    return f"{prefix}{next_seq:04d}"
