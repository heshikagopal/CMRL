from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str | None = None
    permissions: dict[str, Any] = {}


class DepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    is_active: bool


class VendorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    gst_number: str | None = None
    is_active: bool


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    low_stock_threshold: int
    is_active: bool


class CategoryThresholdUpdate(BaseModel):
    low_stock_threshold: int = Field(..., ge=0, le=500)


class LocationCreate(BaseModel):
    location_code: str = Field(..., min_length=2, max_length=32)
    name: str = Field(..., min_length=2, max_length=150)
    location_type: str = Field(..., pattern=r"^(METRO_STATION|DEPOT|CENTRAL_STORE|OFFICE|DATA_CENTRE|OTHER)$")
    metro_line: str = Field(default="NONE", pattern=r"^(BLUE|GREEN|INTERCHANGE|NONE)$")
    map_x: int | None = None
    map_y: int | None = None
    sequence_order: int = 0
    address: str | None = Field(default=None, max_length=255)
    description: str | None = None
    is_active: bool = True


class LocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    location_type: str | None = Field(default=None, pattern=r"^(METRO_STATION|DEPOT|CENTRAL_STORE|OFFICE|DATA_CENTRE|OTHER)$")
    metro_line: str | None = Field(default=None, pattern=r"^(BLUE|GREEN|INTERCHANGE|NONE)$")
    map_x: int | None = None
    map_y: int | None = None
    sequence_order: int | None = None
    address: str | None = Field(default=None, max_length=255)
    description: str | None = None
    is_active: bool | None = None


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    location_code: str
    name: str
    location_type: str
    metro_line: str
    map_x: int | None = None
    map_y: int | None = None
    sequence_order: int
    address: str | None = None
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    asset_count: int = 0
    working_count: int = 0
    faulty_count: int = 0
    under_repair_count: int = 0
    in_store_count: int = 0


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    value: str
    category: str
    description: str | None = None
    updated_at: datetime


class SettingsBulkUpdate(BaseModel):
    settings: dict[str, str]
