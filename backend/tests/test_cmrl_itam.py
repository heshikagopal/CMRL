import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure backend root is on sys.path
BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ["AUTO_SEED_DEMO"] = "false"

from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services.seed import seed_demo_data  # noqa: E402

TEST_DB_PATH = BACKEND_DIR / "test_suite.db"


@pytest.fixture(scope="module")
def client():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()

    test_engine = create_engine(f"sqlite:///{TEST_DB_PATH.as_posix()}", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    db = TestingSessionLocal()
    seed_demo_data(db, force=True)
    db.close()

    def override_get_db():
        s = TestingSessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    test_engine.dispose()
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()


def _login(client: TestClient, username: str, password: str) -> dict[str, str]:
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_and_seeded_dashboard(client: TestClient):
    h = client.get("/api/health")
    assert h.status_code == 200
    assert h.json()["status"] == "healthy"

    headers = _login(client, "admin", "CmrlAdmin@2026")
    dash = client.get("/api/dashboard/monitor", headers=headers)
    assert dash.status_code == 200
    body = dash.json()
    assert body["counters"]["total_assets"] >= 48
    assert len(body["nodes"]) >= 10
    assert len(body["ticker"]) > 0

    # Click MetroS Data Centre Core zone panel
    dc_node = next(n for n in body["nodes"] if n["location_code"] == "HQ-B1-DC")
    panel = client.get(f"/api/dashboard/stations/{dc_node['location_id']}", headers=headers)
    assert panel.status_code == 200
    assert "Data Centre" in panel.json()["node"]["name"]
    assert len(panel.json()["assets"]) >= 3

    # Global search
    srch = client.get("/api/dashboard/search?q=CMRL-IT-LAP", headers=headers)
    assert srch.status_code == 200
    assert len(srch.json()["assets"]) >= 1


def test_rbac_enforcement(client: TestClient):
    viewer_h = _login(client, "viewer", "CmrlViewer@2026")
    tech_h = _login(client, "tech", "CmrlTech@2026")
    store_h = _login(client, "store", "CmrlStore@2026")

    # Viewer cannot register asset or access user management
    res_reg = client.post(
        "/api/assets",
        headers=viewer_h,
        json={
            "name": "Unauthorized Laptop",
            "category_id": 1,
            "manufacturer": "Dell",
            "model": "5440",
            "serial_number": "SN-UNAUTH-1",
            "location_id": 1,
        },
    )
    assert res_reg.status_code == 403

    res_users = client.get("/api/users", headers=tech_h)
    assert res_users.status_code == 403

    # Viewer cannot open fault ticket or update settings
    res_tkt = client.post(
        "/api/tickets",
        headers=viewer_h,
        json={
            "asset_code_or_id": "CMRL-IT-LAP-0001",
            "fault_category": "Network",
            "description": "Viewer should be forbidden",
            "priority": "LOW",
        },
    )
    assert res_tkt.status_code == 403

    res_settings = client.put("/api/settings", headers=store_h, json={"settings": {"warranty_alert_days": "15"}})
    assert res_settings.status_code == 403

    # Store keeper can view inventory
    res_inv = client.get("/api/inventory/summary", headers=store_h)
    assert res_inv.status_code == 200


def test_asset_registration_qr_and_lifecycle(client: TestClient):
    store_h = _login(client, "store", "CmrlStore@2026")
    admin_h = _login(client, "admin", "CmrlAdmin@2026")

    cats = client.get("/api/master/categories", headers=store_h).json()
    lap_cat = next(c for c in cats if c["code"] == "LAP")
    locs = client.get("/api/locations", headers=store_h).json()
    store_loc = next(l for l in locs if l["location_code"] == "HQ-2F-STR")
    eng_loc = next(l for l in locs if l["location_code"] == "HQ-4F-ENG")

    # Register new laptop
    reg = client.post(
        "/api/assets",
        headers=store_h,
        json={
            "name": "Nandanam HQ Test Laptop",
            "category_id": lap_cat["id"],
            "manufacturer": "Dell",
            "model": "Latitude 5440",
            "serial_number": "CMRL-TEST-SN-9901",
            "location_id": store_loc["id"],
            "remarks": "Integration test registration",
        },
    )
    assert reg.status_code == 201, reg.text
    asset = reg.json()
    aid = asset["asset_id"]
    assert aid.startswith("CMRL-IT-LAP-")
    assert asset["status"] == "IN_STORE"

    # Duplicate serial number blocked
    dup = client.post(
        "/api/assets",
        headers=store_h,
        json={
            "name": "Duplicate Laptop",
            "category_id": lap_cat["id"],
            "manufacturer": "Dell",
            "model": "Latitude 5440",
            "serial_number": "CMRL-TEST-SN-9901",
            "location_id": store_loc["id"],
        },
    )
    assert dup.status_code == 409

    # QR PNG generation
    qr_res = client.get(f"/api/assets/{aid}/qr", headers=store_h)
    assert qr_res.status_code == 200
    assert qr_res.headers["content-type"] == "image/png"
    assert qr_res.content[:4] == b"\x89PNG"

    # Issue from 2F Store -> WORKING at 4F Engineering Wing
    issue = client.post(
        "/api/inventory/issue-return",
        headers=store_h,
        json={
            "asset_code_or_id": aid,
            "action": "ISSUE",
            "target_location_id": eng_loc["id"],
            "issued_to": "4F Engineering CAD Lead",
        },
    )
    assert issue.status_code == 200
    assert issue.json()["asset"]["status"] == "WORKING"
    assert issue.json()["asset"]["location"]["id"] == eng_loc["id"]

    # Return to store -> IN_STORE at Central Store
    ret = client.post(
        "/api/inventory/issue-return",
        headers=store_h,
        json={
            "asset_code_or_id": aid,
            "action": "RETURN",
            "target_location_id": store_loc["id"],
            "remarks": "Returned after temporary duty",
        },
    )
    assert ret.status_code == 200
    assert ret.json()["asset"]["status"] == "IN_STORE"
    assert ret.json()["asset"]["location"]["id"] == store_loc["id"]

    # Retire and confirm terminal status blocks transition back to WORKING
    retire = client.post(
        f"/api/assets/{aid}/status",
        headers=admin_h,
        json={"new_status": "RETIRED", "remarks": "Test retirement"},
    )
    assert retire.status_code == 200
    bad_transition = client.post(
        f"/api/assets/{aid}/status",
        headers=admin_h,
        json={"new_status": "WORKING", "remarks": "Should fail"},
    )
    assert bad_transition.status_code == 400

    # Check detail & immutable journey
    detail = client.get(f"/api/assets/{aid}/detail", headers=admin_h)
    assert detail.status_code == 200
    assert len(detail.json()["status_history"]) >= 4
    assert detail.json()["asset"]["asset_id"] == aid

    # Non-admin cannot delete/archive; admin soft-deletes & excludes from active listing
    deny_del = client.delete(f"/api/assets/{aid}", headers=store_h)
    assert deny_del.status_code == 403
    ok_del = client.delete(f"/api/assets/{aid}", headers=admin_h)
    assert ok_del.status_code == 200
    after_del = client.get("/api/assets", headers=admin_h, params={"search": aid})
    assert after_del.status_code == 200
    assert all(item["asset_id"] != aid for item in after_del.json()["items"])


def test_fault_ticket_maintenance_and_movement_approval(client: TestClient):
    admin_h = _login(client, "admin", "CmrlAdmin@2026")
    tech_h = _login(client, "tech", "CmrlTech@2026")
    store_h = _login(client, "store", "CmrlStore@2026")

    # Create fault ticket on working asset CMRL-IT-PC-0002
    tkt_res = client.post(
        "/api/tickets",
        headers=admin_h,
        json={
            "asset_code_or_id": "CMRL-IT-PC-0002",
            "fault_category": "Display Failure",
            "description": "Secondary monitor output blank on 4F Engineering CAD PC.",
            "priority": "HIGH",
        },
    )
    assert tkt_res.status_code == 201, tkt_res.text
    tnum = tkt_res.json()["ticket_number"]
    assert tnum.startswith("CMRL-TKT-")
    assert tkt_res.json()["asset_status"] == "NOT_WORKING"

    # Technician accepts ticket -> UNDER_REPAIR
    acc = client.post(f"/api/tickets/{tnum}/accept", headers=tech_h)
    assert acc.status_code == 200
    assert acc.json()["status"] == "IN_PROGRESS"
    assert acc.json()["asset_status"] == "UNDER_REPAIR"

    # Technician resolves ticket -> WORKING
    res = client.post(
        f"/api/tickets/{tnum}/update",
        headers=tech_h,
        json={
            "status": "RESOLVED",
            "repair_notes": "Replaced DisplayPort cable and updated GPU driver.",
            "spare_parts_used": "DP-HDMI Cable 2m",
        },
    )
    assert res.status_code == 200
    assert res.json()["status"] == "RESOLVED"
    assert res.json()["asset_status"] == "WORKING"

    # Store keeper requests transfer with Admin approval
    locs = client.get("/api/locations", headers=admin_h).json()
    ops_wing = next(l for l in locs if l["location_code"] == "HQ-5F-OPS")
    mov_req = client.post(
        "/api/movements",
        headers=store_h,
        json={
            "asset_code_or_id": "CMRL-IT-PC-0002",
            "to_location_id": ops_wing["id"],
            "issued_to": "5F Operations Backup Desk",
            "reason": "Operational reallocation within Nandanam HQ",
            "require_approval": True,
        },
    )
    assert mov_req.status_code == 201
    assert mov_req.json()["approval_status"] == "PENDING"
    mov_id = mov_req.json()["id"]

    # Admin approves pending movement; Asset ID stays CMRL-IT-PC-0002
    dec = client.post(f"/api/movements/{mov_id}/decision", headers=admin_h, json={"action": "APPROVE"})
    assert dec.status_code == 200
    assert dec.json()["approval_status"] == "COMPLETED"
    assert dec.json()["asset_id"] == "CMRL-IT-PC-0002"

    updated_asset = client.get("/api/assets/CMRL-IT-PC-0002", headers=admin_h).json()
    assert updated_asset["location"]["id"] == ops_wing["id"]


def test_locations_users_settings_notifications_and_reports(client: TestClient):
    admin_h = _login(client, "admin", "CmrlAdmin@2026")
    viewer_h = _login(client, "viewer", "CmrlViewer@2026")

    # Locations CRUD (Nandanam HQ Zone)
    loc_create = client.post(
        "/api/locations",
        headers=admin_h,
        json={
            "location_code": "HQ-1F-TRN",
            "name": "1F — Training & Simulation Wing",
            "location_type": "OFFICE",
            "metro_line": "NONE",
            "address": "MetroS HQ, 1st Floor, Nandanam, Chennai",
        },
    )
    assert loc_create.status_code == 201
    loc_id = loc_create.json()["id"]
    loc_upd = client.put(f"/api/locations/{loc_id}", headers=admin_h, json={"description": "Staff IT Training Wing"})
    assert loc_upd.status_code == 200

    # Users CRUD
    roles = client.get("/api/master/roles", headers=admin_h).json()
    viewer_role = next(r for r in roles if r["name"] == "VIEWER")
    u_create = client.post(
        "/api/users",
        headers=admin_h,
        json={
            "employee_id": "CMRL-EMP-1999",
            "full_name": "Test Management Officer",
            "username": "mgmt_test",
            "email": "mgmt_test@cmrl-itam.local",
            "password": "TestUser@2026",
            "role_id": viewer_role["id"],
        },
    )
    assert u_create.status_code == 201
    uid = u_create.json()["id"]
    u_upd = client.put(f"/api/users/{uid}", headers=admin_h, json={"is_active": False})
    assert u_upd.status_code == 200
    assert u_upd.json()["is_active"] is False

    # Settings & Audit Logs
    set_upd = client.put("/api/settings", headers=admin_h, json={"settings": {"warranty_alert_days": "45"}})
    assert set_upd.status_code == 200
    logs = client.get("/api/settings/audit-logs", headers=admin_h)
    assert logs.status_code == 200
    assert len(logs.json()) >= 5

    # Notifications scan & read
    scan = client.post("/api/notifications/scan-alerts", headers=admin_h)
    assert scan.status_code == 200
    notifs = client.get("/api/notifications", headers=admin_h)
    assert notifs.status_code == 200
    assert len(notifs.json()["items"]) >= 4

    # All 9 report previews & exports
    analytics = client.get("/api/reports/analytics", headers=viewer_h)
    assert analytics.status_code == 200
    assert len(analytics.json()["status_distribution"]) == 5

    for rtype in [
        "asset_register",
        "asset_status",
        "station_wise",
        "category_wise",
        "fault_maintenance",
        "asset_movement",
        "warranty_expiry",
        "spare_inventory",
        "retired_assets",
    ]:
        prev = client.get(f"/api/reports/preview?report_type={rtype}", headers=viewer_h)
        assert prev.status_code == 200, f"Preview failed for {rtype}"

    for fmt, magic in [("csv", None), ("xlsx", b"PK"), ("pdf", b"%PDF")]:
        exp = client.get(f"/api/reports/export?report_type=asset_register&format={fmt}", headers=viewer_h)
        assert exp.status_code == 200
        if magic:
            assert exp.content.startswith(magic)
        else:
            assert b"CMRL-IT-" in exp.content
