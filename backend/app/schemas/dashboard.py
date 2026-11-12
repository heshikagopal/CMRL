from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict


class DashboardCounters(BaseModel):
    total_assets: int
    working: int
    not_working: int
    in_store: int
    under_repair: int
    retired: int
    open_tickets: int
    overdue_tickets: int
    expiring_warranty_30d: int
    low_stock_categories: int


class StationNodeSummary(BaseModel):
    location_id: int
    location_code: str
    name: str
    location_type: str
    metro_line: str
    map_x: int | None = None
    map_y: int | None = None
    sequence_order: int
    total_assets: int
    working_count: int
    not_working_count: int
    under_repair_count: int
    in_store_count: int
    retired_count: int
    open_tickets_count: int
    critical_tickets_count: int
    expiring_warranty_count: int
    health_status: str  # GREEN, AMBER, RED, GREY
    fault_density_pct: float


class ActivityTickerItem(BaseModel):
    id: int
    asset_id: str
    event_label: str
    location_name: str
    timestamp: datetime
    time_display: str
    severity: str


class DashboardResponse(BaseModel):
    counters: DashboardCounters
    nodes: list[StationNodeSummary]
    ticker: list[ActivityTickerItem]


class StationAssetMini(BaseModel):
    id: int
    asset_id: str
    name: str
    category_code: str
    category_name: str
    status: str
    assigned_to_name: str | None = None
    warranty_end: str | None = None


class StationTicketMini(BaseModel):
    id: int
    ticket_number: str
    asset_id: str
    fault_category: str
    priority: str
    status: str
    reported_at: datetime


class StationCategoryBreakdown(BaseModel):
    category_code: str
    category_name: str
    count: int


class StationDetailPanel(BaseModel):
    node: StationNodeSummary
    category_breakdown: list[StationCategoryBreakdown]
    recent_tickets: list[StationTicketMini]
    assets: list[StationAssetMini]


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    message: str
    notification_type: str
    severity: str
    entity_type: str | None = None
    entity_id: str | None = None
    is_read: bool
    created_at: datetime


class AnalyticsResponse(BaseModel):
    status_distribution: list[dict[str, Any]]
    category_distribution: list[dict[str, Any]]
    station_distribution: list[dict[str, Any]]
    monthly_fault_trends: list[dict[str, Any]]
    warranty_overview: list[dict[str, Any]]
    ticket_metrics: dict[str, Any]
