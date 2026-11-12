# CMRL ITAM — Setup, Database & Deployment Guide

## 1. Prerequisites
- Python **3.12+**
- Node.js **20+** & npm **10+**
- Optional (for PostgreSQL mode): PostgreSQL 16 or Docker Desktop

## 2. Environment Configuration

Copy `backend/.env.example` to `backend/.env` and customize secrets before deployment:

```env
APP_NAME="CMRL IT Asset Management & Monitoring System"
APP_ENV="development"

# Option A: PostgreSQL 16 (Recommended for enterprise/staging)
# DATABASE_URL="postgresql+psycopg2://cmrl_admin:cmrl_secure_pass@localhost:5432/cmrl_itam"

# Option B: Zero-config local SQLite fallback (Default for immediate local evaluation)
DATABASE_URL="sqlite:///./cmrl_itam.db"

JWT_SECRET_KEY="replace-with-a-strong-random-hex-secret"
JWT_ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=720
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
AUTO_SEED_DEMO=true
FRONTEND_BASE_URL="http://localhost:5173"
```

Never commit production `.env` secrets to version control.

## 3. PostgreSQL Database Setup

If PostgreSQL is not installed locally on your workstation, the application defaults to local SQLite (`backend/cmrl_itam.db`) so all migrations, seeding, exports, and dashboards work immediately without external setup.

To run with **PostgreSQL 16**:

1. Start PostgreSQL via Docker Compose from the repository root:
   ```bash
   docker compose up -d postgres
   ```
   *(Or create a local database `cmrl_itam` and user `cmrl_admin` in your local PostgreSQL instance.)*
2. Update `DATABASE_URL` in `backend/.env`:
   ```env
   DATABASE_URL="postgresql+psycopg2://cmrl_admin:cmrl_secure_pass@localhost:5432/cmrl_itam"
   ```
3. Run Alembic migrations and seed demo data:
   ```powershell
   cd backend
   .\.venv\Scripts\python.exe -m alembic upgrade head
   .\.venv\Scripts\python.exe seed_db.py
   ```

## 4. Backend Installation & Running

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe seed_db.py
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

*(Note: On Windows systems with Application Control policies that block `.exe` script shims inside virtual environments, always invoke tools using `.\.venv\Scripts\python.exe -m <module>`, e.g. `-m uvicorn`, `-m alembic`, `-m pytest`.)*

API Docs (Swagger UI) will be available at `http://127.0.0.1:8000/docs`.

## 5. Frontend Installation & Running

```powershell
cd frontend
npm install
npm run dev
```

Vite dev server starts at `http://localhost:5173` and automatically proxies `/api`, `/static`, and `/ws` requests to `http://127.0.0.1:8000`.

Production build:
```powershell
cd frontend
npm run build
```

## 6. Running Automated Tests

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -v
```

## 7. Known Local Environment Notes
- **External Email / SMS Notifications:** Configured via `system_settings` (`enable_email_notifications`, `enable_sms_notifications`). Disabled in local prototype mode; all notifications operate via the in-app Notification Centre and live WebSocket broadcasts.
- **Camera QR Scanning:** Requires HTTPS or `localhost` browser camera permission. Image file upload QR decoding and direct Asset ID lookup are included as built-in fallbacks for desktop workstations without webcams.
