import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def export_csv_bytes(headers: list[str], rows: list[list[Any]]) -> bytes:
    buf = StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if v is None else str(v) for v in row])
    return buf.getvalue().encode("utf-8-sig")


def export_excel_bytes(title: str, headers: list[str], rows: list[list[Any]]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "CMRL Report"

    # Title banner
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
    title_cell = ws.cell(row=1, column=1, value=f"CMRL HEAD OFFICE (NANDANAM) - {title}")
    title_cell.font = Font(name="Calibri", size=13, bold=True, color="FFFFFF")
    title_cell.fill = PatternFill(start_color="0F2942", end_color="0F2942", fill_type="solid")
    title_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 28

    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=max(len(headers), 1))
    sub_cell = ws.cell(
        row=2,
        column=1,
        value=f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | Total Records: {len(rows)}",
    )
    sub_cell.font = Font(name="Calibri", size=10, italic=True, color="334155")
    ws.row_dimensions[2].height = 20

    header_fill = PatternFill(start_color="0066B3", end_color="0066B3", fill_type="solid")
    header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")

    for col_idx, h in enumerate(headers, start=1):
        c = ws.cell(row=4, column=col_idx, value=h)
        c.fill = header_fill
        c.font = header_font
        c.alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[4].height = 24

    for r_idx, row in enumerate(rows, start=5):
        for c_idx, val in enumerate(row, start=1):
            cell = ws.cell(row=r_idx, column=c_idx, value="" if val is None else str(val))
            cell.alignment = Alignment(horizontal="left", vertical="center")
            if r_idx % 2 == 1:
                cell.fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")

    for col_idx in range(1, len(headers) + 1):
        col_letter = get_column_letter(col_idx)
        max_len = max(
            [len(str(headers[col_idx - 1]))]
            + [len(str(row[col_idx - 1] or "")) for row in rows[:200]]
        )
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 14), 42)

    ws.freeze_panes = "A5"
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


def export_pdf_bytes(title: str, headers: list[str], rows: list[list[Any]]) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=24,
        rightMargin=24,
        topMargin=24,
        bottomMargin=24,
    )
    styles = getSampleStyleSheet()
    elements = []

    elements.append(Paragraph(f"<b>CMRL Head Office (Nandanam) ITAM — {title}</b>", styles["Title"]))
    elements.append(
        Paragraph(
            f"Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} | Records: {len(rows)} | Internal Prototype Report",
            styles["Normal"],
        )
    )
    elements.append(Spacer(1, 12))

    # Truncate columns gracefully if extremely wide
    safe_headers = headers[:10]
    table_data = [safe_headers]
    for row in rows[:500]:
        table_data.append([("" if v is None else str(v))[:45] for v in row[:10]])

    if len(table_data) == 1:
        table_data.append(["No records found for selected filters"] + [""] * (len(safe_headers) - 1))

    tbl = Table(table_data, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0F2942")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 7.5),
                ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elements.append(tbl)
    doc.build(elements)
    return buf.getvalue()
