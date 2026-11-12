from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field

from app.schemas.master import CategoryOut, DepartmentOut, LocationOut, VendorOut


class AssetCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=160)
    category_id: int
    manufacturer: str = Field(..., min_length=1, max_length=120)
    model: str = Field(..., min_length=1, max_length=120)
    serial_number: str = Field(..., min_length=2, max_length=120)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(default=None, ge=0)
    warranty_start: date | None = None
    warranty_end: date | None = None
    vendor_id: int | None = None
    location_id: int
    department_id: int | None = None
    assigned_to_name: str | None = Field(default=None, max_length=120)
    assigned_to_user_id: int | None = None
    description: str | None = None
    remarks: str | None = None


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    manufacturer: str | None = Field(default=None, min_length=1, max_length=120)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    serial_number: str | None = Field(default=None, min_length=2, max_length=120)
    purchase_date: date | None = None
    purchase_cost: Decimal | None = Field(default=None, ge=0)
    warranty_start: date | None = None
    warranty_end: date | None = None
    vendor_id: int | None = None
    department_id: int | None = None
    assigned_to_name: str | None = Field(default=None, max_length=120)
    assigned_to_user_id: int | None = None
    description: str | None = None
    remarks: str | None = None


class AssetStatusChange(BaseModel):
    new_status: str = Field(..., pattern=r"^(WORKING|NOT_WORKING|IN_STORE|UNDER_REPAIR|RETIRED)$")
    remarks: str = Field(..., min_length=2, max_length=500)
    assigned_to_name: str | None = None
    location_id: int | None = None


class UserMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    employee_id: str
    full_name: str
    username: str


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_id: str
    name: str
    category: CategoryOut
    manufacturer: str
    model: str
    serial_number: str
    purchase_date: date | None = None
    purchase_cost: Decimal | None = None
    warranty_start: date | None = None
    warranty_end: date | None = None
    vendor: VendorOut | None = None
    location: LocationOut
    department: DepartmentOut | None = None
    assigned_to_name: str | None = None
    assigned_to_user_id: int | None = None
    status: str
    description: str | None = None
    remarks: str | None = None
    qr_code_data: str
    qr_image_url: str | None = None
    photo_url: str | None = None
    invoice_url: str | None = None
    is_archived: bool
    created_at: datetime
    updated_at: datetime


class AssetListResponse(BaseModel):
    items: list[AssetOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class StatusHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    previous_status: str | None = None
    new_status: str
    changed_by: int | None = None
    changed_by_name: str | None = None
    remarks: str | None = None
    changed_at: datetime


class AssetJourneyEvent(BaseModel):
    id: str
    event_type: str
    title: str
    subtitle: str | None = None
    timestamp: datetime
    actor_name: str
    status: str | None = None
    remarks: str | None = None
