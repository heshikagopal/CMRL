from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.asset import Asset, AssetCategory, AuditLog, Notification, StatusHistory
from app.models.core import Department, Location, Role, SystemSetting, User, Vendor
from app.models.operations import AssetMovement, InventoryTransaction, MaintenanceTicket, MaintenanceUpdate
from app.services.qr_service import build_qr_payload, ensure_asset_qr_file


def seed_demo_data(db: Session, force: bool = False) -> bool:
    existing_users = db.query(func.count(User.id)).scalar() or 0
    if existing_users > 0 and not force:
        return False

    today = date.today()
    now = datetime.now(timezone.utc)

    # 1. Roles
    role_defs = [
        ("ADMIN", "System Administrator with full access across CMRL Nandanam HQ ITAM", {"all": True}),
        ("TECHNICIAN", "IT Maintenance Technician handling fault tickets and repairs", {"tickets": True, "repair": True}),
        ("STORE_KEEPER", "HQ Central IT Store Keeper managing inventory, stock-in, issue & returns", {"store": True, "movements": True}),
        ("VIEWER", "Management / Viewer with read-only dashboard and reports access", {"readonly": True}),
    ]
    roles: dict[str, Role] = {}
    for name, desc, perms in role_defs:
        r = db.query(Role).filter(Role.name == name).first()
        if not r:
            r = Role(name=name, description=desc, permissions=perms)
            db.add(r)
            db.flush()
        roles[name] = r

    # 2. Departments (Head Office Nandanam Wings)
    dept_defs = [
        ("IT", "Information Technology", "HQ Enterprise IT, Data Centre, Helpdesk, and Core Network"),
        ("ENG", "Engineering & Systems", "Civil, Electrical, Rolling Stock & Signalling HQ Design Wings"),
        ("TEL", "Telecom & Surveillance", "HQ NOC, CCTV monitoring, access control & IP telephony"),
        ("AFC", "AFC & Revenue Systems", "Fare collection clearinghouse, audit & ticketing backoffice"),
        ("FIN", "Finance, HR & Administration", "Corporate administration, procurement, payroll & executive office"),
    ]
    depts: dict[str, Department] = {}
    for code, name, desc in dept_defs:
        d = db.query(Department).filter(Department.code == code).first()
        if not d:
            d = Department(code=code, name=name, description=desc)
            db.add(d)
            db.flush()
        depts[code] = d

    # 3. Locations — CMRL Head Office (MetroS, Anna Salai, Nandanam) Floors, Wings & IT Zones ONLY
    loc_defs = [
        ("HQ-5F-EXEC", "5F — MD & Executive Boardrooms", "OFFICE", "NONE", 260, 92, 1, "MetroS HQ, 5th Floor West Wing, Nandanam, Chennai", "Managing Director office, Director suites & Boardroom AV/IT"),
        ("HQ-5F-OPS", "5F — Operations & Planning Wing", "OFFICE", "NONE", 740, 92, 2, "MetroS HQ, 5th Floor East Wing, Nandanam, Chennai", "Corporate Operations Planning, Scheduling & MIS Workstations"),
        ("HQ-4F-ENG", "4F — Engineering & Systems Wing", "OFFICE", "NONE", 260, 178, 3, "MetroS HQ, 4th Floor West Wing, Nandanam, Chennai", "CAD, Signalling & Systems Engineering Design Workstations"),
        ("HQ-4F-NOC", "4F — Telecom & Surveillance NOC", "DATA_CENTRE", "NONE", 740, 178, 4, "MetroS HQ, 4th Floor East Wing, Nandanam, Chennai", "HQ Network Operations Centre, Video Wall & Security NVR Hub"),
        ("HQ-3F-ADM", "3F — HR & Corporate Admin Wing", "OFFICE", "NONE", 260, 264, 5, "MetroS HQ, 3rd Floor West Wing, Nandanam, Chennai", "Human Resources, Legal & General Administration Wing"),
        ("HQ-3F-FIN", "3F — Finance & Procurement Wing", "OFFICE", "NONE", 740, 264, 6, "MetroS HQ, 3rd Floor East Wing, Nandanam, Chennai", "Corporate Finance, ERP Billing, Tender & Procurement Wing"),
        ("HQ-2F-HLP", "2F — IT Helpdesk & Repair Lab", "OTHER", "NONE", 260, 350, 7, "MetroS HQ, 2nd Floor West Wing, Nandanam, Chennai", "IT Support Workbench, Diagnostics & Hardware Repair Bay"),
        ("HQ-2F-STR", "2F — HQ Central IT Store", "CENTRAL_STORE", "NONE", 740, 350, 8, "MetroS HQ, 2nd Floor East Wing, Nandanam, Chennai", "Central Spare IT Asset Buffer, Staging & Issue Store"),
        ("HQ-GF-SEC", "GF — Reception & Security IT", "OFFICE", "NONE", 260, 436, 9, "MetroS HQ, Ground Floor Lobby, Nandanam, Chennai", "Main Lobby Reception, Visitor Kiosks & Biometric Gate Control"),
        ("HQ-B1-DC", "B1 — MetroS Data Centre Core", "DATA_CENTRE", "NONE", 740, 436, 10, "MetroS HQ, Basement B1 Server Vault, Nandanam, Chennai", "Primary HQ Server Racks, Core Switches, Firewall & Precision UPS"),
    ]
    locs: dict[str, Location] = {}
    for code, name, ltype, line, mx, my, seq, addr, desc in loc_defs:
        loc = db.query(Location).filter(Location.location_code == code).first()
        if not loc:
            loc = Location(
                location_code=code,
                name=name,
                location_type=ltype,
                metro_line=line,
                map_x=mx,
                map_y=my,
                sequence_order=seq,
                address=addr,
                description=desc,
            )
            db.add(loc)
            db.flush()
        locs[code] = loc

    # 4. Demo Users (fictional operational profiles; credentials documented in README/SETUP only)
    user_defs = [
        ("CMRL-EMP-1001", "Karthikeyan Natarajan", "admin", "admin@cmrl-itam.local", "CmrlAdmin@2026", "9840010001", "ADMIN", "IT", "HQ-2F-HLP"),
        ("CMRL-EMP-1042", "Meenakshi Sundaram", "tech", "tech@cmrl-itam.local", "CmrlTech@2026", "9840010042", "TECHNICIAN", "IT", "HQ-2F-HLP"),
        ("CMRL-EMP-1055", "Prakash Rajendran", "tech2", "tech2@cmrl-itam.local", "CmrlTech@2026", "9840010055", "TECHNICIAN", "TEL", "HQ-4F-NOC"),
        ("CMRL-EMP-1088", "Lakshmi Narayanan", "store", "store@cmrl-itam.local", "CmrlStore@2026", "9840010088", "STORE_KEEPER", "IT", "HQ-2F-STR"),
        ("CMRL-EMP-1120", "Anitha Venkatesh", "viewer", "viewer@cmrl-itam.local", "CmrlViewer@2026", "9840010120", "VIEWER", "FIN", "HQ-5F-EXEC"),
    ]
    users: dict[str, User] = {}
    for emp_id, full_name, uname, email, raw_pw, phone, rname, dcode, lcode in user_defs:
        u = db.query(User).filter(User.username == uname).first()
        if not u:
            u = User(
                employee_id=emp_id,
                full_name=full_name,
                username=uname,
                email=email,
                password_hash=hash_password(raw_pw),
                phone=phone,
                role_id=roles[rname].id,
                department_id=depts[dcode].id,
                location_id=locs[lcode].id,
                is_active=True,
            )
            db.add(u)
            db.flush()
        users[uname] = u

    # 5. Asset Categories
    cat_defs = [
        ("LAP", "Laptops", "Executive, engineering & IT staff corporate laptops", 2),
        ("PC", "Desktops & Workstations", "Wing workstations, CAD & ERP office terminals", 2),
        ("SW", "Network Switches", "Floor IDF PoE switches & Data Centre core aggregation switches", 2),
        ("CCTV", "CCTV & NVR Systems", "HQ perimeter & lobby surveillance NVRs & IP dome cameras", 2),
        ("UPS", "UPS & Power Backup", "Data Centre & floor IDF online uninterruptible power supplies", 2),
        ("PRN", "Printers & Scanners", "Wing multifunction network printers & barcode label printers", 1),
        ("SRV", "Enterprise Servers", "MetroS Data Centre application, ERP & backup rack servers", 1),
        ("OTH", "Other IT Equipment", "Next-gen firewalls, boardroom AV & biometric access controllers", 1),
    ]
    cats: dict[str, AssetCategory] = {}
    for code, name, desc, thresh in cat_defs:
        c = db.query(AssetCategory).filter(AssetCategory.code == code).first()
        if not c:
            c = AssetCategory(code=code, name=name, description=desc, low_stock_threshold=thresh)
            db.add(c)
            db.flush()
        cats[code] = c

    # 6. Vendors
    vendor_defs = [
        ("VND-DEL", "Dell Technologies India", "Raghavan Menon", "support@dell-partner.example", "044-22501100", "Guindy Industrial Estate, Chennai", "33AAACD1234F1Z5"),
        ("VND-CIS", "Cisco Systems Enterprise Partner", "Deepak Iyer", "noc@cisco-partner.example", "044-28152200", "Tidel Park, Taramani, Chennai", "33AABCC5678G1Z2"),
        ("VND-HIK", "Hikvision Surveillance Solutions", "Suresh Babu", "service@hik-partner.example", "044-24343300", "Nungambakkam High Rd, Chennai", "33AAACH9012H1Z8"),
        ("VND-APC", "Schneider Electric APC", "Kavitha Krishnan", "apc-care@schneider.example", "044-26214400", "Ambattur Industrial Estate, Chennai", "33AAACS3456J1Z1"),
        ("VND-HPE", "Hewlett Packard Enterprise India", "Vikram Subramanian", "hpe-ent@hpe-partner.example", "044-22205500", "OMR Perungudi, Chennai", "33AAACH7890K1Z4"),
    ]
    vendors: dict[str, Vendor] = {}
    for code, name, cp, em, ph, addr, gst in vendor_defs:
        v = db.query(Vendor).filter(Vendor.code == code).first()
        if not v:
            v = Vendor(code=code, name=name, contact_person=cp, email=em, phone=ph, address=addr, gst_number=gst)
            db.add(v)
            db.flush()
        vendors[code] = v

    # 7. System Settings
    setting_defs = [
        ("organization_name", "CMRL Head Office (MetroS, Nandanam) - ITAM Prototype", "GENERAL", "Organization display header"),
        ("warranty_alert_days", "30", "ALERTS", "Days before warranty expiry to trigger alert"),
        ("ticket_sla_hours_critical", "4", "MAINTENANCE", "SLA hours for CRITICAL fault tickets"),
        ("ticket_sla_hours_standard", "48", "MAINTENANCE", "SLA hours for standard fault tickets"),
        ("enable_email_notifications", "false", "NOTIFICATIONS", "External email relay toggle (disabled in local mode)"),
        ("enable_sms_notifications", "false", "NOTIFICATIONS", "External SMS gateway toggle (disabled in local mode)"),
    ]
    for k, val, cat, desc in setting_defs:
        if not db.query(SystemSetting).filter(SystemSetting.key == k).first():
            db.add(SystemSetting(key=k, value=val, category=cat, description=desc))

    # 8. 48 Sample IT Assets across CMRL Nandanam Head Office (MetroS) Floors & Wings
    # Format: (cat, seq, name, mfg, model, sn, loc_code, dept_code, vendor_code, status, assigned_to, cost, days_ago_purchase, warranty_days_from_today)
    asset_specs = [
        # Laptops (8)
        ("LAP", 1, "Executive Director Ultrabook - 5F", "Dell", "Latitude 7440", "DL7440-HQ-001", "HQ-5F-EXEC", "FIN", "VND-DEL", "WORKING", "R. Balasubramanian (ED Office)", 132000, 420, 675),
        ("LAP", 2, "Operations Planning Lead Laptop", "Dell", "Latitude 5540", "DL5540-HQ-002", "HQ-5F-OPS", "AFC", "VND-DEL", "WORKING", "M. Vigneshwaran (Ops Planning)", 108000, 310, 785),
        ("LAP", 3, "AFC Revenue Audit Laptop - 3F", "HP", "ProBook 450 G10", "HP450-HQ-003", "HQ-3F-FIN", "AFC", "VND-HPE", "WORKING", "P. Divya Bharathi (AFC Audit)", 84500, 200, 895),
        ("LAP", 4, "IT Infrastructure Admin Laptop", "Dell", "Latitude 7440", "DL7440-HQ-004", "HQ-2F-HLP", "IT", "VND-DEL", "WORKING", "Karthikeyan Natarajan", 124000, 180, 915),
        ("LAP", 5, "Telecom NOC Field Diagnostic Laptop", "HP", "EliteBook 840 G10", "HP840-HQ-005", "HQ-4F-NOC", "TEL", "VND-HPE", "UNDER_REPAIR", "Prakash Rajendran", 115000, 700, 20),
        ("LAP", 6, "Spare Corporate Laptop - Unit A", "Dell", "Latitude 5440", "DL5440-HQ-006", "HQ-2F-STR", "IT", "VND-DEL", "IN_STORE", None, 92000, 60, 1035),
        ("LAP", 7, "Spare Corporate Laptop - Unit B", "Dell", "Latitude 5440", "DL5440-HQ-007", "HQ-2F-STR", "IT", "VND-DEL", "IN_STORE", None, 92000, 60, 1035),
        ("LAP", 8, "Legacy Engineering Laptop", "HP", "ProBook 440 G6", "HP440-HQ-008", "HQ-2F-HLP", "ENG", "VND-HPE", "RETIRED", None, 68000, 1900, -400),

        # Desktops / Workstations (7)
        ("PC", 1, "Executive Boardroom AV Workstation", "Dell", "OptiPlex 7010", "OP7010-HQ-101", "HQ-5F-EXEC", "IT", "VND-DEL", "WORKING", "5F Boardroom Console", 84000, 360, 735),
        ("PC", 2, "CAD Signalling Workstation - 4F", "Dell", "OptiPlex 7010", "OP7010-HQ-102", "HQ-4F-ENG", "ENG", "VND-DEL", "WORKING", "S. Muthukumar (Design Desk 1)", 94000, 350, 745),
        ("PC", 3, "HR Payroll Workstation - 3F", "HP", "ProDesk 400 G9", "PD400-HQ-103", "HQ-3F-ADM", "FIN", "VND-HPE", "WORKING", "HR Payroll Desk 2", 71500, 480, 18),
        ("PC", 4, "Finance ERP Billing Terminal - 3F", "Dell", "OptiPlex 5000", "OP5000-HQ-104", "HQ-3F-FIN", "FIN", "VND-DEL", "NOT_WORKING", "Accounts Desk 4", 69000, 620, 110),
        ("PC", 5, "Operations MIS Workstation - 5F", "HP", "ProDesk 400 G9", "PD400-HQ-105", "HQ-5F-OPS", "AFC", "VND-HPE", "WORKING", "5F Ops Analytics Desk", 71500, 290, 805),
        ("PC", 6, "Reception Visitor Badge Terminal - GF", "Dell", "OptiPlex 7010", "OP7010-HQ-106", "HQ-GF-SEC", "IT", "VND-DEL", "WORKING", "Lobby Front Desk", 74000, 210, 885),
        ("PC", 7, "Spare Office Desktop Workstation", "Dell", "OptiPlex 7010", "OP7010-HQ-107", "HQ-2F-STR", "IT", "VND-DEL", "IN_STORE", None, 74000, 45, 1050),

        # Network Switches (8)
        ("SW", 1, "B1 Data Centre Core Aggregation Switch", "Cisco", "Catalyst 9300-48P", "CSC9300-HQ-201", "HQ-B1-DC", "IT", "VND-CIS", "WORKING", "B1 Core Rack R01", 420000, 500, 1325),
        ("SW", 2, "3F Finance Wing IDF PoE Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-202", "HQ-3F-FIN", "IT", "VND-CIS", "NOT_WORKING", "3F East IDF Closet", 185000, 690, 14),
        ("SW", 3, "4F Engineering Wing IDF Switch", "Cisco", "Catalyst 9200L-48P", "CSC9200-HQ-203", "HQ-4F-ENG", "IT", "VND-CIS", "WORKING", "4F West IDF Closet", 235000, 410, 685),
        ("SW", 4, "5F Executive Wing IDF Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-204", "HQ-5F-EXEC", "IT", "VND-CIS", "WORKING", "5F IDF Closet", 185000, 330, 765),
        ("SW", 5, "4F NOC Video Wall Aggregation Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-205", "HQ-4F-NOC", "TEL", "VND-CIS", "UNDER_REPAIR", "4F NOC Core Rack", 185000, 580, 150),
        ("SW", 6, "3F Admin Wing IDF Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-206", "HQ-3F-ADM", "IT", "VND-CIS", "WORKING", "3F West IDF Closet", 185000, 260, 835),
        ("SW", 7, "GF Lobby Security PoE Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-207", "HQ-GF-SEC", "TEL", "VND-CIS", "WORKING", "GF Security Closet", 185000, 240, 855),
        ("SW", 8, "Spare 24-Port PoE IDF Switch", "Cisco", "Catalyst 9200L-24P", "CSC9200-HQ-208", "HQ-2F-STR", "IT", "VND-CIS", "IN_STORE", None, 185000, 90, 1005),

        # CCTV & NVR Systems (7)
        ("CCTV", 1, "HQ Master Surveillance NVR - 4F NOC", "Hikvision", "DS-9664NI-M8", "HK9664-HQ-301", "HQ-4F-NOC", "TEL", "VND-HIK", "WORKING", "4F NOC Control Desk", 210000, 400, 695),
        ("CCTV", 2, "Main Lobby PTZ Dome Array - GF", "Hikvision", "DS-2DE7A432IW", "HK2DE7-HQ-302", "HQ-GF-SEC", "TEL", "VND-HIK", "WORKING", "Main Atrium Ceiling", 64000, 310, 24),
        ("CCTV", 3, "B1 Server Vault Access Camera", "Hikvision", "DS-2CD2746G2", "HK2CD2-HQ-303", "HQ-B1-DC", "TEL", "VND-HIK", "NOT_WORKING", "B1 Mantrap Door", 38000, 520, 210),
        ("CCTV", 4, "3F Finance Corridor NVR Sub-Node", "Hikvision", "DS-9632NI-I8", "HK9632-HQ-304", "HQ-3F-FIN", "TEL", "VND-HIK", "WORKING", "3F East Vault Entry", 165000, 280, 815),
        ("CCTV", 5, "5F Executive Lobby Surveillance NVR", "Hikvision", "DS-9632NI-I8", "HK9632-HQ-305", "HQ-5F-EXEC", "TEL", "VND-HIK", "UNDER_REPAIR", "5F Executive Reception", 165000, 610, 120),
        ("CCTV", 6, "2F Central Store Security Camera Cluster", "Hikvision", "DS-2CD2746G2", "HK2CD2-HQ-306", "HQ-2F-STR", "TEL", "VND-HIK", "WORKING", "2F Store Entry Gate", 42000, 150, 945),
        ("CCTV", 7, "Spare 4MP IR Dome Camera", "Hikvision", "DS-2CD2746G2", "HK2CD2-HQ-307", "HQ-2F-STR", "TEL", "VND-HIK", "IN_STORE", None, 38000, 35, 1060),

        # UPS & Power Backup (6)
        ("UPS", 1, "4F NOC Online UPS 10kVA", "APC", "Smart-UPS SRT 10kVA", "APC10K-HQ-401", "HQ-4F-NOC", "TEL", "VND-APC", "WORKING", "4F NOC Power Bay", 295000, 450, 645),
        ("UPS", 2, "4F Engineering IDF UPS 6kVA", "APC", "Smart-UPS SRT 6kVA", "APC6K-HQ-402", "HQ-4F-ENG", "IT", "VND-APC", "WORKING", "4F West Power Closet", 178000, 370, 10),
        ("UPS", 3, "GF Lobby Security UPS 5kVA", "APC", "Smart-UPS SRT 5kVA", "APC5K-HQ-403", "HQ-GF-SEC", "IT", "VND-APC", "NOT_WORKING", "GF Security Guardroom", 155000, 740, -10),
        ("UPS", 4, "B1 Data Centre Precision UPS Bank", "APC", "Symmetra LX 16kVA", "APCSYM-HQ-404", "HQ-B1-DC", "IT", "VND-APC", "WORKING", "B1 Server Power Room", 680000, 510, 950),
        ("UPS", 5, "2F Helpdesk Testbench UPS 6kVA", "APC", "Smart-UPS SRT 6kVA", "APC6K-HQ-405", "HQ-2F-HLP", "IT", "VND-APC", "UNDER_REPAIR", "2F Repair Workbench", 178000, 640, 90),
        ("UPS", 6, "Spare Online UPS 3kVA", "APC", "Smart-UPS SRT 3kVA", "APC3K-HQ-406", "HQ-2F-STR", "IT", "VND-APC", "IN_STORE", None, 98000, 75, 1020),

        # Printers (5)
        ("PRN", 1, "3F Admin Wing Multifunction Laser", "HP", "LaserJet Pro M428fdw", "HPM428-HQ-501", "HQ-3F-ADM", "FIN", "VND-HPE", "WORKING", "3F Admin Copy Bay", 48000, 290, 440),
        ("PRN", 2, "4F Engineering Wing Laser Printer", "HP", "LaserJet M404dn", "HPM404-HQ-502", "HQ-4F-ENG", "ENG", "VND-HPE", "WORKING", "4F Design Print Bay", 34000, 380, 26),
        ("PRN", 3, "2F Central Store QR & Barcode Printer", "HP", "LaserJet M404dn", "HPM404-HQ-503", "HQ-2F-STR", "IT", "VND-HPE", "WORKING", "Central Store Staging Desk", 34000, 210, 520),
        ("PRN", 4, "GF Reception Visitor Pass Thermal Printer", "HP", "Engage Thermal T88", "HPTH88-HQ-504", "HQ-GF-SEC", "IT", "VND-HPE", "NOT_WORKING", "Lobby Reception Counter", 22000, 650, 80),
        ("PRN", 5, "Legacy Engineering A0 Plotter", "HP", "DesignJet T120", "HPDJ120-HQ-505", "HQ-4F-ENG", "ENG", "VND-HPE", "RETIRED", None, 112000, 2100, -500),

        # Enterprise Servers (4)
        ("SRV", 1, "CMRL HQ ITAM & Asset Core Server", "HPE", "ProLiant DL380 Gen11", "HPEDL380-HQ-601", "HQ-B1-DC", "IT", "VND-HPE", "WORKING", "B1 Rack R01-U12", 890000, 180, 1645),
        ("SRV", 2, "AFC Clearinghouse Database Node", "Dell", "PowerEdge R750", "DLR750-HQ-602", "HQ-B1-DC", "AFC", "VND-DEL", "WORKING", "B1 Rack R02-U08", 940000, 320, 1505),
        ("SRV", 3, "4F NOC Video Analytics Host", "HPE", "ProLiant DL360 Gen10", "HPEDL360-HQ-603", "HQ-4F-NOC", "TEL", "VND-HPE", "WORKING", "4F NOC Rack N02", 620000, 490, 605),
        ("SRV", 4, "B1 Secondary Backup Storage Server", "Dell", "PowerEdge R550", "DLR550-HQ-604", "HQ-B1-DC", "IT", "VND-DEL", "UNDER_REPAIR", "B1 Rack R03-U04", 480000, 610, 120),

        # Other IT Equipment (3)
        ("OTH", 1, "B1 Perimeter Next-Gen Firewall", "Cisco", "Firepower 2130", "CSCFP21-HQ-701", "HQ-B1-DC", "IT", "VND-CIS", "WORKING", "B1 DMZ Rack R01", 540000, 250, 845),
        ("OTH", 2, "5F Executive Boardroom Video Codec", "Dell", "Latitude 7230 Rugged", "DLRUG72-HQ-702", "HQ-5F-EXEC", "IT", "VND-DEL", "WORKING", "5F Boardroom AV Rack", 145000, 140, 955),
        ("OTH", 3, "GF HQ Main Lobby Biometric Turnstile Controller", "Hikvision", "DS-K1T671M", "HKK1T-HQ-703", "HQ-GF-SEC", "IT", "VND-HIK", "WORKING", "Ground Floor Lobby Gate", 28000, 110, 985),
    ]

    assets: dict[str, Asset] = {}
    for (cat_code, seq, name, mfg, model, sn, loc_code, dept_code, vnd_code, status_val, assigned_to, cost, days_ago, w_days) in asset_specs:
        aid = f"CMRL-IT-{cat_code}-{seq:04d}"
        existing = db.query(Asset).filter(Asset.asset_id == aid).first()
        if existing:
            assets[aid] = existing
            continue

        p_date = today - timedelta(days=days_ago)
        w_start = p_date
        w_end = today + timedelta(days=w_days)
        qr_img_url = ensure_asset_qr_file(aid, cat_code)

        asset = Asset(
            asset_id=aid,
            name=name,
            category_id=cats[cat_code].id,
            manufacturer=mfg,
            model=model,
            serial_number=sn,
            purchase_date=p_date,
            purchase_cost=Decimal(str(cost)),
            warranty_start=w_start,
            warranty_end=w_end,
            vendor_id=vendors[vnd_code].id,
            location_id=locs[loc_code].id,
            department_id=depts[dept_code].id,
            assigned_to_name=assigned_to,
            status=status_val,
            description=f"{mfg} {model} deployed for CMRL Nandanam HQ {depts[dept_code].name} at {locs[loc_code].name}.",
            remarks="Demo seed record for Nandanam HQ ITAM prototype",
            qr_code_data=build_qr_payload(aid),
            qr_image_path=qr_img_url,
            created_by=users["admin"].id,
            created_at=now - timedelta(days=min(days_ago, 180)),
        )
        db.add(asset)
        db.flush()
        assets[aid] = asset

        # Build realistic Asset Journey history
        reg_time = now - timedelta(days=min(days_ago, 120), hours=4)
        db.add(
            StatusHistory(
                asset_id=asset.id,
                previous_status=None,
                new_status="IN_STORE",
                changed_by=users["store"].id,
                remarks="Registered into CMRL Nandanam HQ Central IT Store",
                changed_at=reg_time,
            )
        )
        if status_val in {"WORKING", "NOT_WORKING", "UNDER_REPAIR", "RETIRED"}:
            db.add(
                StatusHistory(
                    asset_id=asset.id,
                    previous_status="IN_STORE",
                    new_status="WORKING",
                    changed_by=users["store"].id,
                    remarks=f"Issued and commissioned at {locs[loc_code].name}",
                    changed_at=reg_time + timedelta(days=2),
                )
            )
        if status_val in {"NOT_WORKING", "UNDER_REPAIR"}:
            db.add(
                StatusHistory(
                    asset_id=asset.id,
                    previous_status="WORKING",
                    new_status="NOT_WORKING",
                    changed_by=users["tech"].id,
                    remarks="Fault reported during HQ floor IT inspection",
                    changed_at=now - timedelta(days=4, hours=3),
                )
            )
        if status_val == "UNDER_REPAIR":
            db.add(
                StatusHistory(
                    asset_id=asset.id,
                    previous_status="NOT_WORKING",
                    new_status="UNDER_REPAIR",
                    changed_by=users["tech"].id,
                    remarks="Technician diagnostics and part replacement in progress at 2F Repair Lab",
                    changed_at=now - timedelta(days=2, hours=5),
                )
            )
        if status_val == "RETIRED":
            db.add(
                StatusHistory(
                    asset_id=asset.id,
                    previous_status="WORKING",
                    new_status="RETIRED",
                    changed_by=users["admin"].id,
                    remarks="End-of-life decommissioned and marked for HQ e-waste disposal",
                    changed_at=now - timedelta(days=15),
                )
            )

    # 9. Maintenance Tickets (11 realistic tickets across Nandanam HQ zones)
    ticket_specs = [
        ("CMRL-TKT-0001", "CMRL-IT-SW-0002", "Network Connectivity", "PoE ports 9-16 unresponsive on 3F Finance IDF switch; wing uplink degraded.", "CRITICAL", "OPEN", "admin", None, 2, -6, None),
        ("CMRL-TKT-0002", "CMRL-IT-UPS-0003", "Power / Battery", "GF Lobby Security 5kVA UPS battery bank fault alarm triggered; zero hold time.", "CRITICAL", "ASSIGNED", "admin", "tech", 3, -12, None),
        ("CMRL-TKT-0003", "CMRL-IT-PC-0004", "Hardware Failure", "3F Finance ERP Billing Terminal failing POST with NVMe controller error.", "HIGH", "OPEN", "store", None, 1, 18, None),
        ("CMRL-TKT-0004", "CMRL-IT-CCTV-0003", "Camera Offline", "B1 Data Centre mantrap access IP camera dropping PoE link intermittently.", "HIGH", "ASSIGNED", "admin", "tech2", 4, 24, None),
        ("CMRL-TKT-0005", "CMRL-IT-PRN-0004", "Peripheral Fault", "GF Reception visitor badge thermal printer cutter jam & printhead fault.", "MEDIUM", "IN_PROGRESS", "store", "tech2", 2, 30, None),
        ("CMRL-TKT-0006", "CMRL-IT-SW-0005", "Power Supply Module", "4F NOC Video Wall switch primary PSU failed; awaiting hot-swap PSU spare.", "HIGH", "WAITING_SPARE_PARTS", "admin", "tech", 5, -18, None),
        ("CMRL-TKT-0007", "CMRL-IT-LAP-0005", "Display / Hinge", "4F NOC diagnostic laptop flickering LCD panel during field inspection.", "MEDIUM", "IN_PROGRESS", "tech2", "tech", 6, 36, None),
        ("CMRL-TKT-0008", "CMRL-IT-UPS-0005", "Fan & Thermal", "2F Helpdesk testbench 6kVA UPS cooling fan module replacement underway.", "HIGH", "IN_PROGRESS", "admin", "tech2", 3, 20, None),
        ("CMRL-TKT-0009", "CMRL-IT-SRV-0004", "Storage Array", "B1 Secondary backup server RAID-5 degraded drive #3 rebuild.", "HIGH", "IN_PROGRESS", "admin", "tech", 4, 16, None),
        ("CMRL-TKT-0010", "CMRL-IT-CCTV-0001", "Firmware / Storage", "4F NOC Master NVR HDD #4 smart warning cleared and RAID verified.", "LOW", "RESOLVED", "tech", "tech", 22, -100, "Replaced SATA enterprise drive #4 and verified 30-day retention loop."),
        ("CMRL-TKT-0011", "CMRL-IT-PC-0001", "OS & Security Patch", "5F Executive Boardroom AV workstation OS hardening & calibration completed.", "LOW", "CLOSED", "admin", "tech", 45, -400, "Applied CMRL baseline patch bundle and tested dual-display conferencing feed."),
    ]
    for tnum, aid, fcat, desc, prio, tstatus, rep_u, ass_u, days_ago, due_offset_hrs, res_sum in ticket_specs:
        if db.query(MaintenanceTicket).filter(MaintenanceTicket.ticket_number == tnum).first():
            continue
        asset = assets[aid]
        rep_dt = now - timedelta(days=days_ago)
        due_dt = now + timedelta(hours=due_offset_hrs)
        resolved_dt = (now - timedelta(days=max(days_ago - 2, 1))) if tstatus in {"RESOLVED", "CLOSED"} else None
        closed_dt = resolved_dt if tstatus == "CLOSED" else None

        tkt = MaintenanceTicket(
            ticket_number=tnum,
            asset_id=asset.id,
            location_id=asset.location_id,
            fault_category=fcat,
            description=desc,
            priority=prio,
            status=tstatus,
            reported_by=users[rep_u].id,
            assigned_to=users[ass_u].id if ass_u else None,
            reported_at=rep_dt,
            due_date=due_dt,
            resolved_at=resolved_dt,
            closed_at=closed_dt,
            resolution_summary=res_sum,
            remarks="Demo operational maintenance record",
        )
        db.add(tkt)
        db.flush()

        db.add(
            MaintenanceUpdate(
                ticket_id=tkt.id,
                updated_by=users[rep_u].id,
                previous_status=None,
                new_status="OPEN",
                repair_notes=f"Initial fault ticket logged: {desc}",
                created_at=rep_dt,
            )
        )
        if tstatus != "OPEN" and ass_u:
            db.add(
                MaintenanceUpdate(
                    ticket_id=tkt.id,
                    updated_by=users[ass_u].id,
                    previous_status="OPEN",
                    new_status=tstatus,
                    repair_notes=res_sum or f"Technician {users[ass_u].full_name} accepted task and initiated diagnostics.",
                    spare_parts_used="SFP+ Transceiver / Thermal Paste" if tstatus in {"RESOLVED", "CLOSED"} else None,
                    created_at=rep_dt + timedelta(hours=3),
                )
            )

    # 10. Asset Movements (inter-floor & inter-wing transfers within Nandanam HQ)
    mov_specs = [
        ("CMRL-MOV-0001", "CMRL-IT-LAP-0001", "HQ-2F-STR", "HQ-5F-EXEC", 65, "R. Balasubramanian", "store", "admin", "COMPLETED", "Executive Wing laptop deployment"),
        ("CMRL-MOV-0002", "CMRL-IT-SW-0003", "HQ-2F-STR", "HQ-4F-ENG", 50, "4F West IDF Closet", "store", "admin", "COMPLETED", "4th Floor Engineering switch capacity upgrade"),
        ("CMRL-MOV-0003", "CMRL-IT-PC-0005", "HQ-2F-STR", "HQ-5F-OPS", 40, "5F Ops Analytics Desk", "store", "admin", "COMPLETED", "Operations Planning MIS workstation upgrade"),
        ("CMRL-MOV-0004", "CMRL-IT-CCTV-0006", "HQ-4F-NOC", "HQ-2F-STR", 30, "2F Store Entry Gate", "store", "admin", "COMPLETED", "Store vault CCTV coverage installation"),
        ("CMRL-MOV-0005", "CMRL-IT-OTH-0002", "HQ-2F-STR", "HQ-5F-EXEC", 18, "5F Boardroom AV Rack", "store", "admin", "COMPLETED", "Boardroom conferencing codec deployment"),
        ("CMRL-MOV-0006", "CMRL-IT-LAP-0006", "HQ-2F-STR", "HQ-3F-FIN", 1, "Finance Audit Officer", "store", None, "PENDING", "Pending approval for Finance audit backup laptop"),
    ]
    for mnum, aid, fl, tl, d_ago, iss, req_u, app_u, mstat, reason in mov_specs:
        if db.query(AssetMovement).filter(AssetMovement.movement_number == mnum).first():
            continue
        db.add(
            AssetMovement(
                movement_number=mnum,
                asset_id=assets[aid].id,
                from_location_id=locs[fl].id,
                to_location_id=locs[tl].id,
                transfer_date=today - timedelta(days=d_ago),
                issued_to=iss,
                requested_by=users[req_u].id,
                approved_by=users[app_u].id if app_u else None,
                approval_status=mstat,
                reason=reason,
                remarks="Permanent CMRL Asset ID retained across Nandanam HQ floor transfer",
            )
        )

    # 11. Inventory Transactions
    inv_specs = [
        ("CMRL-TXN-0001", "CMRL-IT-LAP-0006", "HQ-2F-STR", "STOCK_IN", None, "store", "New Dell Latitude spare stock received at 2F Store"),
        ("CMRL-TXN-0002", "CMRL-IT-LAP-0007", "HQ-2F-STR", "STOCK_IN", None, "store", "New Dell Latitude spare stock received at 2F Store"),
        ("CMRL-TXN-0003", "CMRL-IT-SW-0008", "HQ-2F-STR", "STOCK_IN", None, "store", "Cisco spare switch buffered for HQ floors"),
        ("CMRL-TXN-0004", "CMRL-IT-LAP-0001", "HQ-5F-EXEC", "ISSUE", "R. Balasubramanian", "store", "Issued from 2F Central IT Store to 5F Executive Wing"),
        ("CMRL-TXN-0005", "CMRL-IT-SW-0003", "HQ-4F-ENG", "ISSUE", "4F West IDF Closet", "store", "Issued to 4F Engineering Wing IDF"),
        ("CMRL-TXN-0006", "CMRL-IT-OTH-0002", "HQ-5F-EXEC", "ISSUE", "5F Boardroom AV Rack", "store", "Issued conferencing unit to 5F Boardroom"),
    ]
    for xnum, aid, lcode, xtype, iss, perf_u, rem in inv_specs:
        if db.query(InventoryTransaction).filter(InventoryTransaction.transaction_number == xnum).first():
            continue
        asset = assets[aid]
        db.add(
            InventoryTransaction(
                transaction_number=xnum,
                asset_id=asset.id,
                category_id=asset.category_id,
                location_id=locs[lcode].id,
                transaction_type=xtype,
                quantity=1,
                issued_to=iss,
                performed_by=users[perf_u].id,
                remarks=rem,
                created_at=now - timedelta(days=10),
            )
        )

    # 12. Notifications
    notif_specs = [
        ("Critical Fault: 3F Finance Switch Offline", "CMRL-IT-SW-0002 at 3F Finance & Procurement Wing reported CRITICAL PoE failure.", "FAULT_REPORTED", "CRITICAL", "TICKET", "CMRL-TKT-0001", None, 2),
        ("Overdue Maintenance Alert", "CMRL-TKT-0002 (GF Reception Security UPS 5kVA) has exceeded its critical SLA target.", "OVERDUE_TICKET", "CRITICAL", "TICKET", "CMRL-TKT-0002", "TECHNICIAN", 4),
        ("Warranty Expiring Within 30 Days", "4 HQ IT assets (including CMRL-IT-SW-0002 and CMRL-IT-UPS-0002) have warranties expiring within 30 days.", "WARRANTY_EXPIRY", "WARNING", "REPORT", "warranty", "ADMIN", 8),
        ("Low Spare Stock Alert", "Categories PC, SW, CCTV, UPS, PRN are below minimum store buffer thresholds at 2F Central Store.", "LOW_STOCK", "WARNING", "INVENTORY", "HQ-2F-STR", "STORE_KEEPER", 12),
        ("Pending Floor Transfer Approval", "Movement CMRL-MOV-0006 requests transfer of CMRL-IT-LAP-0006 to 3F Finance Wing.", "TRANSFER_PENDING", "INFO", "MOVEMENT", "CMRL-MOV-0006", "ADMIN", 16),
    ]
    if db.query(func.count(Notification.id)).scalar() == 0:
        for title, msg, ntype, sev, etype, eid, trole, hrs_ago in notif_specs:
            db.add(
                Notification(
                    target_role=trole,
                    title=title,
                    message=msg,
                    notification_type=ntype,
                    severity=sev,
                    entity_type=etype,
                    entity_id=eid,
                    is_read=False,
                    created_at=now - timedelta(hours=hrs_ago),
                )
            )

    # 13. Audit Logs (drives recent activity ticker + audit trail)
    audit_specs = [
        ("FAULT_REPORTED", "ASSET", "CMRL-IT-SW-0002", "Fault reported | 3F Finance Wing", {"location": "3F — Finance & Procurement Wing", "ticket": "CMRL-TKT-0001"}, "admin", 1),
        ("FAULT_REPORTED", "ASSET", "CMRL-IT-UPS-0003", "Critical UPS failure | GF Security IT", {"location": "GF — Reception & Security IT", "ticket": "CMRL-TKT-0002"}, "admin", 2),
        ("MOVEMENT_REQUESTED", "ASSET", "CMRL-IT-LAP-0006", "Floor transfer requested | 3F Finance Wing", {"location": "3F — Finance & Procurement Wing", "movement": "CMRL-MOV-0006"}, "store", 4),
        ("REPAIR_STARTED", "ASSET", "CMRL-IT-UPS-0005", "Repair in progress | 2F IT Repair Lab", {"location": "2F — IT Helpdesk & Repair Lab", "ticket": "CMRL-TKT-0008"}, "tech2", 6),
        ("ASSET_ISSUED", "ASSET", "CMRL-IT-OTH-0002", "Asset issued | 5F Executive Wing", {"location": "5F — MD & Executive Boardrooms"}, "store", 9),
        ("REPAIR_COMPLETED", "ASSET", "CMRL-IT-CCTV-0001", "Repair resolved | 4F Telecom NOC", {"location": "4F — Telecom & Surveillance NOC", "ticket": "CMRL-TKT-0010"}, "tech", 14),
        ("ASSET_REGISTERED", "ASSET", "CMRL-IT-LAP-0007", "Stock registered | 2F Central IT Store", {"location": "2F — HQ Central IT Store"}, "store", 20),
    ]
    if db.query(func.count(AuditLog.id)).scalar() == 0:
        for action, etype, eid, summary, details, uname, hrs_ago in audit_specs:
            db.add(
                AuditLog(
                    user_id=users[uname].id,
                    username=uname,
                    action=action,
                    entity_type=etype,
                    entity_id=eid,
                    summary=summary,
                    details=details,
                    created_at=now - timedelta(hours=hrs_ago),
                )
            )

    db.commit()
    return True
