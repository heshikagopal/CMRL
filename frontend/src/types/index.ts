export type RoleName = "ADMIN" | "TECHNICIAN" | "STORE_KEEPER" | "VIEWER";

export type AssetStatus = "WORKING" | "NOT_WORKING" | "IN_STORE" | "UNDER_REPAIR" | "RETIRED";

export type MetroLine = "BLUE" | "GREEN" | "INTERCHANGE" | "NONE";

export type LocationType = "METRO_STATION" | "DEPOT" | "CENTRAL_STORE" | "OFFICE" | "DATA_CENTRE" | "OTHER";

export interface RoleSummary {
  id: number;
  name: RoleName;
  description?: string | null;
}

export interface Department {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
}

export interface Vendor {
  id: number;
  code: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  gst_number?: string | null;
  is_active?: boolean;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  low_stock_threshold: number;
  is_active: boolean;
}

export interface Location {
  id: number;
  location_code: string;
  name: string;
  location_type: LocationType;
  metro_line: MetroLine;
  map_x?: number | null;
  map_y?: number | null;
  sequence_order: number;
  address?: string | null;
  description?: string | null;
  is_active: boolean;
  asset_count: number;
  working_count: number;
  faulty_count: number;
  under_repair_count: number;
  in_store_count: number;
}

export interface User {
  id: number;
  employee_id: string;
  full_name: string;
  username: string;
  email: string;
  phone?: string | null;
  role: RoleSummary;
  department?: Department | null;
  location?: {
    id: number;
    location_code: string;
    name: string;
    location_type: string;
    metro_line: string;
  } | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface Asset {
  id: number;
  asset_id: string;
  name: string;
  category: Category;
  manufacturer: string;
  model: string;
  serial_number: string;
  purchase_date?: string | null;
  purchase_cost?: string | number | null;
  warranty_start?: string | null;
  warranty_end?: string | null;
  vendor?: Vendor | null;
  location: Location;
  department?: Department | null;
  assigned_to_name?: string | null;
  assigned_to_user_id?: number | null;
  status: AssetStatus;
  description?: string | null;
  remarks?: string | null;
  qr_code_data: string;
  qr_image_url?: string | null;
  photo_url?: string | null;
  invoice_url?: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetListResponse {
  items: Asset[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface StatusHistoryItem {
  id: number;
  previous_status?: string | null;
  new_status: string;
  changed_by?: number | null;
  changed_by_name?: string | null;
  remarks?: string | null;
  changed_at: string;
}

export interface AssetJourneyEvent {
  id: string;
  event_type: "STATUS" | "MOVEMENT" | "TICKET";
  title: string;
  subtitle?: string | null;
  timestamp: string;
  actor_name: string;
  status?: string | null;
  remarks?: string | null;
}

export interface TicketUpdate {
  id: number;
  ticket_id: number;
  updated_by: number;
  updated_by_name: string;
  previous_status?: string | null;
  new_status: string;
  repair_notes: string;
  spare_parts_used?: string | null;
  photo_url?: string | null;
  created_at: string;
}

export interface MaintenanceTicket {
  id: number;
  ticket_number: string;
  asset_db_id: number;
  asset_id: string;
  asset_name: string;
  asset_category: string;
  asset_status: string;
  location_id: number;
  location_name: string;
  fault_category: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "WAITING_SPARE_PARTS" | "RESOLVED" | "CLOSED";
  reported_by: number;
  reported_by_name: string;
  assigned_to?: number | null;
  assigned_to_name?: string | null;
  reported_at: string;
  due_date?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  resolution_summary?: string | null;
  remarks?: string | null;
  supporting_photo_url?: string | null;
  is_overdue: boolean;
  updates: TicketUpdate[];
}

export interface AssetMovement {
  id: number;
  movement_number: string;
  asset_db_id: number;
  asset_id: string;
  asset_name: string;
  asset_category: string;
  from_location_id: number;
  from_location_name: string;
  to_location_id: number;
  to_location_name: string;
  transfer_date: string;
  issued_to?: string | null;
  requested_by: number;
  requested_by_name: string;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  reason: string;
  remarks?: string | null;
  created_at: string;
}

export interface InventoryCategorySummary {
  category_id: number;
  code: string;
  name: string;
  total_assets: number;
  in_store_count: number;
  working_count: number;
  under_repair_count: number;
  not_working_count: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
}

export interface InventoryTransaction {
  id: number;
  transaction_number: string;
  asset_db_id: number;
  asset_id: string;
  asset_name: string;
  category_code: string;
  category_name: string;
  location_name: string;
  transaction_type: string;
  quantity: number;
  issued_to?: string | null;
  performed_by_name: string;
  remarks?: string | null;
  created_at: string;
}

export interface StationNodeSummary {
  location_id: number;
  location_code: string;
  name: string;
  location_type: LocationType;
  metro_line: MetroLine;
  map_x?: number | null;
  map_y?: number | null;
  sequence_order: number;
  total_assets: number;
  working_count: number;
  not_working_count: number;
  under_repair_count: number;
  in_store_count: number;
  retired_count: number;
  open_tickets_count: number;
  critical_tickets_count: number;
  expiring_warranty_count: number;
  health_status: "GREEN" | "AMBER" | "RED" | "GREY";
  fault_density_pct: number;
}

export interface ActivityTickerItem {
  id: number;
  asset_id: string;
  event_label: string;
  location_name: string;
  timestamp: string;
  time_display: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
}

export interface DashboardCounters {
  total_assets: number;
  working: number;
  not_working: number;
  in_store: number;
  under_repair: number;
  retired: number;
  open_tickets: number;
  overdue_tickets: number;
  expiring_warranty_30d: number;
  low_stock_categories: number;
}

export interface DashboardResponse {
  counters: DashboardCounters;
  nodes: StationNodeSummary[];
  ticker: ActivityTickerItem[];
}

export interface StationDetailPanel {
  node: StationNodeSummary;
  category_breakdown: { category_code: string; category_name: string; count: number }[];
  recent_tickets: {
    id: number;
    ticket_number: string;
    asset_id: string;
    fault_category: string;
    priority: string;
    status: string;
    reported_at: string;
  }[];
  assets: {
    id: number;
    asset_id: string;
    name: string;
    category_code: string;
    category_name: string;
    status: AssetStatus;
    assigned_to_name?: string | null;
    warranty_end?: string | null;
  }[];
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  entity_type?: string | null;
  entity_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface SystemSetting {
  id: number;
  key: string;
  value: string;
  category: string;
  description?: string | null;
  updated_at: string;
}
