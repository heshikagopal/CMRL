# CMRL Nandanam Head Office — IT Asset Management & Monitoring System (CMRL ITAM)

> **Prototype Disclaimer:** This application is an internal enterprise IT Asset Management & Monitoring prototype scoped specifically for **Chennai Metro Rail Limited (CMRL) Head Office (MetroS, Anna Salai, Nandanam, Chennai)**. All seeded HQ zones, employee accounts, serial numbers, and asset records are fictional demonstration data. It does not claim production approval, official CMRL endorsement, or connection to live railway or corporate infrastructure.

## Overview

CMRL ITAM centralizes IT asset registration, permanent QR identification, location tracking, maintenance ticketing, spare inventory control, inter-floor transfers, and operational analytics exclusively across **CMRL Nandanam Head Office** floors, wings, Central IT Store, Helpdesk Repair Lab, and MetroS Data Centre.

### Key Capabilities
- **CMRL Nandanam HQ Asset Monitor (Live Dashboard):** Interactive floor-by-floor building & fiber-riser schematic covering **Nandanam Head Office (`5F` to `GF` + `B1` Data Centre)**:
  - `5F` Executive Boardrooms & Operations Planning Wing
  - `4F` Engineering & Systems Wing + Telecom & Surveillance NOC
  - `3F` HR & Corporate Admin Wing + Finance & Procurement Wing
  - `2F` IT Helpdesk & Repair Lab + **HQ Central IT Store** (`HQ-2F-STR`)
  - `GF` Main Lobby Reception & Security IT + `B1` **MetroS Data Centre Core** (`HQ-B1-DC`)
  - Dynamic heatmap toggles (**Asset Health View**, **Fault Density View**, **Warranty Expiry View**), clickable zone inspection panel, live counters, and live activity ticker backed by WebSockets (`/ws/live`).
- **Permanent Asset Identity & QR Labels:** Auto-generated permanent IDs (`CMRL-IT-<CATEGORY>-<NNNN>`, e.g., `CMRL-IT-LAP-0001`), PNG QR codes, printable asset tags, and camera/file/ID QR Scanner (`/scanner`).
- **Controlled Asset Lifecycle:** `IN_STORE`, `WORKING`, `NOT_WORKING`, `UNDER_REPAIR`, `RETIRED` with backend FSM transition enforcement, immutable `status_history`, and unified **Asset Journey** timeline.
- **Fault & Maintenance Ticketing (`CMRL-TKT-NNNN`):** Fault reporting, SLA tracking, overdue alerts, technician task acceptance, repair notes, spare parts logging, and automatic asset status synchronization.
- **Inventory & Central IT Store Management (`HQ-2F-STR`):** Category stock levels across 8 categories (`LAP`, `PC`, `SW`, `CCTV`, `UPS`, `PRN`, `SRV`, `OTH`), configurable low-stock thresholds, Issue & Return workflows.
- **Asset Movements (`CMRL-MOV-NNNN`):** Inter-floor and inter-wing transfers within Nandanam HQ preserving permanent Asset IDs, with optional Admin approval workflow.
- **Reports & Analytics:** Interactive Recharts visualizations + 9 report types (including **Floor / Zone-wise Asset Report**) exportable to **CSV**, **Excel (`.xlsx`)**, and **PDF (`.pdf`)**.
- **RBAC & Audit Logging:** Backend-enforced permissions across `ADMIN`, `TECHNICIAN`, `STORE_KEEPER`, and `VIEWER` roles with JWT authentication and bcrypt password hashing.

## Technology Stack
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts, React Router, React Hook Form + Zod, Axios, `qrcode.react`, `html5-qrcode`
- **Backend:** Python 3.12, FastAPI, SQLAlchemy 2.0 ORM, Alembic migrations, PyJWT, bcrypt, qrcode, openpyxl, reportlab, WebSockets
- **Database:** PostgreSQL 16 (production / Docker configuration) with zero-config local SQLite fallback (`sqlite:///./cmrl_itam.db`) for immediate local development.

## Local Development Demo Credentials

> **Note:** Demo credentials below are provided strictly in local development documentation for prototype evaluation.

| Role | Username | Password | Access Scope |
|---|---|---|---|
| **ADMIN** | `admin` | `CmrlAdmin@2026` | Full system access, approvals, HQ zones, users, settings |
| **TECHNICIAN** | `tech` | `CmrlTech@2026` | 2F IT Helpdesk & Repair Lab technician; tickets & repair logs |
| **TECHNICIAN (2)** | `tech2` | `CmrlTech@2026` | 4F Telecom & NOC technician |
| **STORE KEEPER** | `store` | `CmrlStore@2026` | 2F Central IT Store inventory, stock-in, issue/return & transfers |
| **VIEWER / MGMT** | `viewer` | `CmrlViewer@2026` | Read-only executive dashboard, asset details, reports & exports |

## Quick Start (Local Development)

See [SETUP.md](./SETUP.md) for complete installation, PostgreSQL configuration, Alembic migrations, and testing commands.

### 1. Start Backend API
```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe seed_db.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Start Frontend UI
```powershell
cd frontend
npm run dev
```

Open `http://localhost:5173` in your browser.
