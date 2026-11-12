from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.core import utcnow


class MaintenanceTicket(Base):
    __tablename__ = "maintenance_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    fault_category: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(String(24), default="MEDIUM", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="OPEN", nullable=False, index=True)
    reported_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    assigned_to: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)
    due_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    supporting_photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    asset: Mapped["Asset"] = relationship("Asset")  # type: ignore[name-defined]
    location: Mapped["Location"] = relationship("Location")  # type: ignore[name-defined]
    reporter: Mapped["User"] = relationship("User", foreign_keys=[reported_by])  # type: ignore[name-defined]
    technician: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to])  # type: ignore[name-defined]
    updates: Mapped[list["MaintenanceUpdate"]] = relationship(
        "MaintenanceUpdate", back_populates="ticket", order_by="MaintenanceUpdate.created_at.desc()"
    )


class MaintenanceUpdate(Base):
    __tablename__ = "maintenance_updates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    ticket_id: Mapped[int] = mapped_column(ForeignKey("maintenance_tickets.id", ondelete="CASCADE"), nullable=False, index=True)
    updated_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    new_status: Mapped[str] = mapped_column(String(32), nullable=False)
    repair_notes: Mapped[str] = mapped_column(Text, nullable=False)
    spare_parts_used: Mapped[str | None] = mapped_column(String(255), nullable=True)
    photo_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    ticket: Mapped["MaintenanceTicket"] = relationship("MaintenanceTicket", back_populates="updates")
    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined]


class AssetMovement(Base):
    __tablename__ = "asset_movements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    movement_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    from_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    to_location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    issued_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(24), default="COMPLETED", nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    asset: Mapped["Asset"] = relationship("Asset")  # type: ignore[name-defined]
    from_location: Mapped["Location"] = relationship("Location", foreign_keys=[from_location_id])  # type: ignore[name-defined]
    to_location: Mapped["Location"] = relationship("Location", foreign_keys=[to_location_id])  # type: ignore[name-defined]
    requester: Mapped["User"] = relationship("User", foreign_keys=[requested_by])  # type: ignore[name-defined]
    approver: Mapped["User | None"] = relationship("User", foreign_keys=[approved_by])  # type: ignore[name-defined]


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    transaction_number: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("asset_categories.id"), nullable=False, index=True)
    location_id: Mapped[int] = mapped_column(ForeignKey("locations.id"), nullable=False, index=True)
    transaction_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    issued_to: Mapped[str | None] = mapped_column(String(120), nullable=True)
    performed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False, index=True)

    asset: Mapped["Asset"] = relationship("Asset")  # type: ignore[name-defined]
    category: Mapped["AssetCategory"] = relationship("AssetCategory")  # type: ignore[name-defined]
    location: Mapped["Location"] = relationship("Location")  # type: ignore[name-defined]
    performer: Mapped["User"] = relationship("User")  # type: ignore[name-defined]
