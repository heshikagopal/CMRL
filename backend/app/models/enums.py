from enum import Enum


class RoleName(str, Enum):
    ADMIN = "ADMIN"
    TECHNICIAN = "TECHNICIAN"
    STORE_KEEPER = "STORE_KEEPER"
    VIEWER = "VIEWER"


class LocationType(str, Enum):
    METRO_STATION = "METRO_STATION"
    DEPOT = "DEPOT"
    CENTRAL_STORE = "CENTRAL_STORE"
    OFFICE = "OFFICE"
    DATA_CENTRE = "DATA_CENTRE"
    OTHER = "OTHER"


class MetroLine(str, Enum):
    BLUE = "BLUE"
    GREEN = "GREEN"
    INTERCHANGE = "INTERCHANGE"
    NONE = "NONE"


class AssetStatus(str, Enum):
    WORKING = "WORKING"
    NOT_WORKING = "NOT_WORKING"
    IN_STORE = "IN_STORE"
    UNDER_REPAIR = "UNDER_REPAIR"
    RETIRED = "RETIRED"


class TicketPriority(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TicketStatus(str, Enum):
    OPEN = "OPEN"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    WAITING_SPARE_PARTS = "WAITING_SPARE_PARTS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class MovementApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    COMPLETED = "COMPLETED"


class InventoryTransactionType(str, Enum):
    STOCK_IN = "STOCK_IN"
    ISSUE = "ISSUE"
    RETURN = "RETURN"
    TRANSFER = "TRANSFER"
    ADJUSTMENT = "ADJUSTMENT"
    RETIRE = "RETIRE"


class NotificationSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class AttachmentEntityType(str, Enum):
    ASSET_PHOTO = "ASSET_PHOTO"
    ASSET_INVOICE = "ASSET_INVOICE"
    TICKET_PHOTO = "TICKET_PHOTO"
    REPAIR_PHOTO = "REPAIR_PHOTO"
