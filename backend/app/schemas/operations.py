from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field


class TicketCreate(BaseModel):
    asset_code_or_id: str | int
    fault_category: str = Field(..., min_length=2, max_length=80)
    description: str = Field(..., min_length=4, max_length=2000)
    priority: str = Field(default="MEDIUM", pattern=r"^(LOW|MEDIUM|HIGH|CRITICAL)$")
    location_id: int | None = None
    assigned_to: int | None = None
    remarks: str | None = None


class TicketUpdateAction(BaseModel):
    status: str | None = Field(default=None, pattern=r"^(OPEN|ASSIGNED|IN_PROGRESS|WAITING_SPARE_PARTS|RESOLVED|CLOSED)$")
    assigned_to: int | None = None
    priority: str | None = Field(default=None, pattern=r"^(LOW|MEDIUM|HIGH|CRITICAL)$")
    repair_notes: str = Field(..., min_length=2, max_length=2000)
    spare_parts_used: str | None = Field(default=None, max_length=255)
    asset_target_status: str | None = Field(default=None, pattern=r"^(WORKING|IN_STORE|RETIRED|UNDER_REPAIR|NOT_WORKING)$")
    resolution_summary: str | None = None


class TicketUpdateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_id: int
    updated_by: int
    updated_by_name: str
    previous_status: str | None = None
    new_status: str
    repair_notes: str
    spare_parts_used: str | None = None
    photo_url: str | None = None
    created_at: datetime


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    ticket_number: str
    asset_db_id: int
    asset_id: str
    asset_name: str
    asset_category: str
    asset_status: str
    location_id: int
    location_name: str
    fault_category: str
    description: str
    priority: str
    status: str
    reported_by: int
    reported_by_name: str
    assigned_to: int | None = None
    assigned_to_name: str | None = None
    reported_at: datetime
    due_date: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    resolution_summary: str | None = None
    remarks: str | None = None
    supporting_photo_url: str | None = None
    is_overdue: bool = False
    updates: list[TicketUpdateOut] = []


class MovementCreate(BaseModel):
    asset_code_or_id: str | int
    to_location_id: int
    transfer_date: date | None = None
    issued_to: str | None = Field(default=None, max_length=120)
    reason: str = Field(..., min_length=2, max_length=255)
    remarks: str | None = None
    require_approval: bool = False


class MovementApprovalAction(BaseModel):
    action: str = Field(..., pattern=r"^(APPROVE|REJECT)$")
    remarks: str | None = None


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    movement_number: str
    asset_db_id: int
    asset_id: str
    asset_name: str
    asset_category: str
    from_location_id: int
    from_location_name: str
    to_location_id: int
    to_location_name: str
    transfer_date: date
    issued_to: str | None = None
    requested_by: int
    requested_by_name: str
    approved_by: int | None = None
    approved_by_name: str | None = None
    approval_status: str
    reason: str
    remarks: str | None = None
    created_at: datetime


class InventoryIssueReturnRequest(BaseModel):
    asset_code_or_id: str | int
    action: str = Field(..., pattern=r"^(ISSUE|RETURN)$")
    target_location_id: int
    issued_to: str | None = Field(default=None, max_length=120)
    remarks: str | None = None


class InventoryTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    transaction_number: str
    asset_db_id: int
    asset_id: str
    asset_name: str
    category_code: str
    category_name: str
    location_name: str
    transaction_type: str
    quantity: int
    issued_to: str | None = None
    performed_by_name: str
    remarks: str | None = None
    created_at: datetime


class InventoryCategorySummary(BaseModel):
    category_id: int
    code: str
    name: str
    total_assets: int
    in_store_count: int
    working_count: int
    under_repair_count: int
    not_working_count: int
    low_stock_threshold: int
    is_low_stock: bool
