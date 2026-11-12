from io import BytesIO
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont

from app.core.config import settings


def build_qr_payload(asset_id: str) -> str:
    base = settings.FRONTEND_BASE_URL.rstrip("/")
    return f"{base}/assets/{asset_id}"


def generate_qr_bytes(asset_id: str, category_code: str = "", include_label: bool = True) -> bytes:
    payload = build_qr_payload(asset_id)
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=2,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#0F172A", back_color="#FFFFFF").convert("RGB")

    if not include_label:
        buf = BytesIO()
        qr_img.save(buf, format="PNG")
        return buf.getvalue()

    qr_w, qr_h = qr_img.size
    pad = 18
    footer_h = 54
    canvas_w = max(qr_w + pad * 2, 260)
    canvas_h = qr_h + pad * 2 + footer_h

    canvas = Image.new("RGB", (canvas_w, canvas_h), "#FFFFFF")
    draw = ImageDraw.Draw(canvas)

    # Top metro accent strip (CMRL Blue + Green split)
    draw.rectangle([0, 0, canvas_w // 2, 6], fill="#0066B3")
    draw.rectangle([canvas_w // 2, 0, canvas_w, 6], fill="#009E49")

    qr_x = (canvas_w - qr_w) // 2
    canvas.paste(qr_img, (qr_x, pad))

    font = ImageFont.load_default()
    title_text = asset_id
    sub_text = f"CMRL ITAM | CAT: {category_code or 'IT'}"
    draw.text((pad, qr_h + pad + 6), title_text, fill="#0F172A", font=font)
    draw.text((pad, qr_h + pad + 26), sub_text, fill="#475569", font=font)

    # Border
    draw.rectangle([0, 0, canvas_w - 1, canvas_h - 1], outline="#CBD5E1", width=1)

    buf = BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def ensure_asset_qr_file(asset_id: str, category_code: str = "") -> str:
    qr_dir = settings.qr_path
    filename = f"{asset_id}.png"
    target = qr_dir / filename
    if not target.exists():
        png_bytes = generate_qr_bytes(asset_id=asset_id, category_code=category_code, include_label=True)
        target.write_bytes(png_bytes)
    return f"/static/qrcodes/{filename}"
