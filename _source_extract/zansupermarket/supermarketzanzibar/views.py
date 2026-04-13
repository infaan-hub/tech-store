import json
import logging
import os
import random
import re
from io import BytesIO
from textwrap import wrap
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from decimal import Decimal
from xml.sax.saxutils import escape
from django.contrib.auth import authenticate, get_user_model
from django.core.mail import send_mail
from django.core.exceptions import SuspiciousOperation
from django.db import DatabaseError, transaction
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework import permissions, status, viewsets, exceptions
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Category, Customer, Payment, Product, Sale, SaleItem, StockMovement, Supplier
from .serializers import (
    AdminCreateUserSerializer,
    AdminRegisterSerializer,
    CategorySerializer,
    CheckoutSerializer,
    CustomerSerializer,
    PaymentSerializer,
    PaymentAdminSerializer,
    ProductSerializer,
    PublicProductSerializer,
    RegisterSerializer,
    SaleItemSerializer,
    SaleSerializer,
    StockSerializer,
    SupplierSerializer,
    ScheduledAccessSerializer,
    UserSerializer,
)

User = get_user_model()
logger = logging.getLogger(__name__)
PRODUCT_SERIALIZATION_ERRORS = (AttributeError, TypeError, ValueError, SuspiciousOperation)
API_SERIALIZATION_ERRORS = PRODUCT_SERIALIZATION_ERRORS
WHATSAPP_ORDER_NUMBER = "255711252758"
STORE_NAME = "Supermarket Zanzibar"
STORE_SUBTITLE = "Fresh groceries, snacks, and daily essentials in Zanzibar."
STORE_PHONE = "+255 711 252 758"
STORE_EMAIL = "info@supermarketzanzibar"
STORE_LOCATION = "Stone Town, Zanzibar"
GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "").strip()
SCHEDULED_ACCESS_ROLES = ("supplier", "driver")
RECEIPT_ABOUT_CARDS = [
    (
        "Fresh supply",
        "We connect Zanzibar shoppers with trusted suppliers for groceries, snacks, and daily essentials.",
    ),
    (
        "Fast discovery",
        "Search products instantly, filter by category, and open any item quickly without losing your place.",
    ),
    (
        "Simple shopping",
        "Browse, add to cart, and move into checkout from the same catalog flow with less friction.",
    ),
]

def serialize_or_raise(serializer_class, instance, *, many=False, context=None):
    serializer = serializer_class(instance, many=many, context=context or {})
    return serializer.data


def api_unavailable_response(detail, *, log_message):
    logger.exception(log_message)
    return Response({"detail": detail}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


def _google_json_request(url, *, method="GET", data=None, headers=None):
    request = Request(url, data=data, headers=headers or {}, method=method)
    with urlopen(request, timeout=15) as response:
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def _verify_google_credential(credential):
    profile = _google_json_request(f"{GOOGLE_TOKENINFO_ENDPOINT}?id_token={quote(credential)}")
    if profile.get("aud") != GOOGLE_CLIENT_ID:
        raise exceptions.ValidationError({"detail": "Google sign in is not configured for this app."})
    return profile


def _sanitize_google_username_seed(value):
    seed = re.sub(r"[^a-z0-9._-]+", "", (value or "").lower())
    return seed[:120] or "customer"


def _build_unique_google_username(profile):
    seed = _sanitize_google_username_seed(profile.get("email", "").split("@")[0]) or _sanitize_google_username_seed(
        profile.get("name", "")
    )
    candidate = seed
    suffix = 1
    while User.objects.filter(username=candidate).exists():
        suffix += 1
        candidate = f"{seed[:140]}{suffix}"
    return candidate[:150]


def _build_unique_google_phone():
    while True:
        candidate = f"google-{random.randint(1000000000, 9999999999)}"
        if not User.objects.filter(phone=candidate).exists():
            return candidate


def _customer_user_from_google_profile(profile):
    email = str(profile.get("email") or "").strip().lower()
    if not email:
        raise exceptions.ValidationError({"detail": "Google did not return an email address."})
    email_verified = profile.get("email_verified")
    if email_verified not in (True, "true", "True", "1", 1):
        raise exceptions.ValidationError({"detail": "Only verified Google email accounts can sign in."})

    existing_user = User.objects.filter(email__iexact=email).first()
    if existing_user:
        if existing_user.role != "customer":
            raise exceptions.PermissionDenied("Only customer accounts can sign in with Google here.")
        if not existing_user.is_active:
            raise exceptions.PermissionDenied("This customer account is inactive.")
        Customer.objects.get_or_create(user=existing_user, defaults={"phone": existing_user.phone})
        return existing_user

    full_name = str(profile.get("name") or email.split("@")[0]).strip() or "Customer"
    user = User.objects.create(
        username=_build_unique_google_username(profile),
        email=email,
        full_name=full_name,
        phone=_build_unique_google_phone(),
        address="",
        role="customer",
        is_active=True,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])
    Customer.objects.get_or_create(user=user, defaults={"phone": user.phone})
    return user


def user_requires_scheduled_access(user):
    return bool(user and getattr(user, "role", None) in SCHEDULED_ACCESS_ROLES)


def user_has_active_scheduled_access(user, *, at_time=None):
    if not user_requires_scheduled_access(user):
        return True

    start = getattr(user, "access_window_start", None)
    end = getattr(user, "access_window_end", None)
    if not start or not end:
        return False

    current_time = at_time or timezone.now()
    return start <= current_time < end


def scheduled_access_denial_detail(user, *, at_time=None):
    if not user_requires_scheduled_access(user):
        return "Access schedule is not required for this account."

    start = getattr(user, "access_window_start", None)
    end = getattr(user, "access_window_end", None)
    if not start or not end:
        return (
            f"Admin has not scheduled access for this {user.role} account yet. "
            "Please contact admin to set your date and time."
        )

    current_time = at_time or timezone.now()
    if current_time < start:
        return (
            f"Your {user.role} access starts at {timezone.localtime(start).strftime('%Y-%m-%d %H:%M:%S %Z')}. "
            "You cannot login before that time."
        )
    if current_time >= end:
        return (
            f"Your {user.role} access ended at {timezone.localtime(end).strftime('%Y-%m-%d %H:%M:%S %Z')}. "
            "Ask admin to schedule a new date and time."
        )
    return ""


def enforce_scheduled_access_or_raise(user):
    if user_has_active_scheduled_access(user):
        return
    raise exceptions.PermissionDenied(scheduled_access_denial_detail(user))


def build_whatsapp_order_url(sale, payment, sale_items):
    lines = [
        "Zanzibar Supermarket Order",
        f"Order ID: {sale.id}",
        f"Control Number: {payment.control_number}",
        f"Customer: {sale.customer_name_display or 'Customer'}",
        f"Email: {sale.customer_email_display or 'Not provided'}",
        f"Phone: {sale.customer_phone_display or 'Not provided'}",
        f"Address: {sale.customer_address_display or 'Not provided'}",
        f"Delivery Location: {sale.delivery_location or 'Not provided'}",
        f"Payment Method: {sale.payment_method}",
        f"Payment Status: {payment.status}",
        f"Total: TZS {sale.final_amount}",
        "Items:",
    ]

    for product, quantity in sale_items:
        lines.append(f"- {product.name} x{quantity} @ TZS {product.price} = TZS {product.price * quantity}")

    message = "\n".join(lines)
    return f"https://wa.me/{WHATSAPP_ORDER_NUMBER}?text={quote(message)}"


def _pdf_escape(value):
    text = str(value)
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _fallback_receipt_text_lines(sale):
    lines = [
        f"{STORE_NAME} Receipt",
        "Payment Confirmed",
        f"Order #{sale.id}",
        f"Control Number: {sale.payment.control_number}",
        f"Order Date: {sale.created_at:%Y-%m-%d %H:%M}",
        "",
        "Customer & Order Details",
        f"Customer: {sale.customer_name_display or 'Customer'}",
        f"Email: {sale.customer_email_display or 'Not provided'}",
        f"Phone: {sale.customer_phone_display or 'Not provided'}",
        f"Address: {sale.customer_address_display or 'Not provided'}",
        f"Delivery Location: {sale.delivery_location or 'Not provided'}",
        f"Payment Method: {sale.payment_method}",
        "",
        "Paid Products",
    ]

    for item in sale.items.all():
        lines.append(f"- {item.product.name} x{item.quantity} @ TZS {item.price} = TZS {item.total}")

    lines.extend(
        [
            "",
            f"Subtotal: TZS {sale.total_amount}",
            f"Discount: TZS {sale.discount}",
            f"Tax: TZS {sale.tax}",
            f"Final Amount: TZS {sale.final_amount}",
            "",
            "About Us",
        ]
    )

    for title, description in RECEIPT_ABOUT_CARDS:
        lines.append(f"- {title}: {description}")

    lines.extend(
        [
            "",
            "Contact Us",
            f"- Phone: {STORE_PHONE}",
            f"- Email: {STORE_EMAIL}",
            f"- Location: {STORE_LOCATION}",
        ]
    )

    wrapped_lines = []
    for line in lines:
        if not line:
            wrapped_lines.append("")
            continue
        wrapped_lines.extend(wrap(line, width=92) or [""])
    return wrapped_lines


def _build_basic_receipt_pdf(sale):
    lines = _fallback_receipt_text_lines(sale)
    lines_per_page = 48
    pages = [lines[index:index + lines_per_page] for index in range(0, len(lines), lines_per_page)] or [[]]
    font_object_id = 3 + len(pages) * 2
    objects = []

    page_refs = " ".join(f"{3 + index * 2} 0 R" for index in range(len(pages)))
    objects.append((1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objects.append((2, f"<< /Type /Pages /Kids [{page_refs}] /Count {len(pages)} >>".encode("ascii")))

    for index, page_lines in enumerate(pages):
        page_object_id = 3 + index * 2
        content_object_id = page_object_id + 1
        commands = [
            "BT",
            "/F1 12 Tf",
            "50 800 Td",
            f"({STORE_NAME} Receipt - Page {index + 1}) Tj",
            "0 -20 Td",
            "/F1 10 Tf",
        ]
        for line in page_lines:
            commands.append(f"({_pdf_escape(line)}) Tj")
            commands.append("0 -14 Td")
        commands.append("ET")
        stream = "\n".join(commands).encode("latin-1", errors="ignore")
        page_body = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_object_id} 0 R >> >> "
            f"/Contents {content_object_id} 0 R >>"
        ).encode("ascii")
        content_body = f"<< /Length {len(stream)} >>\nstream\n".encode("ascii") + stream + b"\nendstream"
        objects.append((page_object_id, page_body))
        objects.append((content_object_id, content_body))

    objects.append((font_object_id, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    objects.sort(key=lambda item: item[0])

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for object_id, body in objects:
        offsets.append(len(pdf))
        pdf.extend(f"{object_id} 0 obj\n".encode("ascii"))
        pdf.extend(body)
        pdf.extend(b"\nendobj\n")

    xref_offset = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("ascii")
    )
    return bytes(pdf)


def _safe_receipt_text(value, fallback="Not provided"):
    if value in (None, ""):
        value = fallback
    return escape(str(value))


def _receipt_money(value):
    return f"TZS {value}"


def _receipt_payment_method(value):
    if not value:
        return "Not provided"
    return str(value).replace("_", " ").title()


def _receipt_palette():
    from reportlab.lib import colors

    return {
        "page": colors.HexColor("#edf6ee"),
        "surface": colors.HexColor("#f8fbf8"),
        "surface_strong": colors.HexColor("#ffffff"),
        "surface_soft": colors.HexColor("#eef5ef"),
        "surface_glow": colors.HexColor("#e1efe3"),
        "border": colors.HexColor("#d7e6d7"),
        "border_strong": colors.HexColor("#bfd8c3"),
        "accent": colors.HexColor("#1f8f3a"),
        "accent_dark": colors.HexColor("#15722d"),
        "accent_soft": colors.HexColor("#dff1e2"),
        "accent_tint": colors.HexColor("#eaf6ec"),
        "header_pill": colors.HexColor("#3da553"),
        "header_pill_border": colors.HexColor("#75c58a"),
        "text": colors.HexColor("#213128"),
        "muted": colors.HexColor("#668070"),
        "gold_soft": colors.HexColor("#efe8ca"),
    }


def _receipt_styles(palette):
    from reportlab.lib import colors
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

    base_styles = getSampleStyleSheet()
    return {
        "brand_kicker": ParagraphStyle(
            "ReceiptBrandKicker",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.2,
            leading=10,
            textColor=colors.whitesmoke,
            spaceAfter=4,
        ),
        "brand_title": ParagraphStyle(
            "ReceiptBrandTitle",
            parent=base_styles["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=24,
            leading=27,
            textColor=colors.whitesmoke,
            spaceAfter=3,
        ),
        "brand_subtitle": ParagraphStyle(
            "ReceiptBrandSubtitle",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.2,
            leading=13,
            textColor=colors.whitesmoke,
        ),
        "status_label": ParagraphStyle(
            "ReceiptStatusLabel",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.1,
            leading=10,
            alignment=2,
            textColor=colors.whitesmoke,
        ),
        "status_primary": ParagraphStyle(
            "ReceiptStatusPrimary",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=12.8,
            leading=15,
            alignment=2,
            textColor=colors.whitesmoke,
        ),
        "status_secondary": ParagraphStyle(
            "ReceiptStatusSecondary",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.2,
            leading=11.5,
            alignment=2,
            textColor=colors.whitesmoke,
        ),
        "section_title": ParagraphStyle(
            "ReceiptSectionTitle",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.4,
            leading=11,
            textColor=palette["accent_dark"],
        ),
        "label": ParagraphStyle(
            "ReceiptLabel",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.1,
            leading=10,
            textColor=palette["muted"],
        ),
        "value": ParagraphStyle(
            "ReceiptValue",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.4,
            leading=12,
            textColor=palette["text"],
        ),
        "value_bold": ParagraphStyle(
            "ReceiptValueBold",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10.1,
            leading=12.6,
            textColor=palette["text"],
        ),
        "success": ParagraphStyle(
            "ReceiptSuccess",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11.8,
            leading=14,
            textColor=palette["accent"],
        ),
        "total": ParagraphStyle(
            "ReceiptTotal",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=18,
            leading=21,
            textColor=palette["accent_dark"],
            alignment=2,
        ),
        "total_small": ParagraphStyle(
            "ReceiptTotalSmall",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15,
            textColor=palette["accent_dark"],
            alignment=2,
        ),
        "product_title": ParagraphStyle(
            "ReceiptProductTitle",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=11.1,
            leading=13.5,
            textColor=palette["text"],
        ),
        "product_meta": ParagraphStyle(
            "ReceiptProductMeta",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=9.1,
            leading=12,
            textColor=palette["muted"],
        ),
        "small": ParagraphStyle(
            "ReceiptSmall",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=palette["muted"],
        ),
        "info_title": ParagraphStyle(
            "ReceiptInfoTitle",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            textColor=palette["text"],
        ),
        "info_text": ParagraphStyle(
            "ReceiptInfoText",
            parent=base_styles["BodyText"],
            fontName="Helvetica",
            fontSize=8.8,
            leading=12,
            textColor=palette["muted"],
        ),
        "badge": ParagraphStyle(
            "ReceiptBadge",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8.2,
            leading=9,
            alignment=1,
            textColor=colors.whitesmoke,
        ),
        "placeholder": ParagraphStyle(
            "ReceiptPlaceholder",
            parent=base_styles["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.8,
            leading=10,
            alignment=1,
            textColor=palette["muted"],
        ),
    }


def _receipt_resolve_color(palette, value):
    return palette[value] if isinstance(value, str) else value


def _receipt_card(content, width, palette, background="surface", border="border", paddings=(12, 12, 10, 10), stroke_width=0.8):
    from reportlab.platypus import Table, TableStyle

    left, right, top, bottom = paddings
    cell_content = content if isinstance(content, list) else [content]
    card = Table([[cell_content]], colWidths=[width] if width is not None else None)
    card.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), _receipt_resolve_color(palette, background)),
                ("BOX", (0, 0), (-1, -1), stroke_width, _receipt_resolve_color(palette, border)),
                ("LEFTPADDING", (0, 0), (-1, -1), left),
                ("RIGHTPADDING", (0, 0), (-1, -1), right),
                ("TOPPADDING", (0, 0), (-1, -1), top),
                ("BOTTOMPADDING", (0, 0), (-1, -1), bottom),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return card


def _receipt_section_header(title, styles, palette):
    from reportlab.platypus import Paragraph

    header = _receipt_card(
        Paragraph(_safe_receipt_text(title), styles["section_title"]),
        None,
        palette,
        background="accent_soft",
        border="border_strong",
        paddings=(12, 12, 7, 7),
    )
    header.hAlign = "LEFT"
    return header


def _receipt_data_card(label, value, width, styles, palette):
    from reportlab.platypus import Paragraph, Spacer

    return _receipt_card(
        [
            Paragraph(_safe_receipt_text(label), styles["label"]),
            Spacer(1, 3),
            Paragraph(_safe_receipt_text(value), styles["value_bold"]),
        ],
        width,
        palette,
        background="surface_soft",
        border="border",
        paddings=(10, 10, 8, 8),
    )


def _receipt_badge(text, styles, palette):
    from reportlab.platypus import Paragraph

    badge = _receipt_card(
        Paragraph(_safe_receipt_text(text), styles["badge"]),
        18,
        palette,
        background="accent",
        border="accent",
        paddings=(0, 0, 4, 4),
        stroke_width=0,
    )
    badge.hAlign = "LEFT"
    return badge


def _receipt_product_visual(file_field, width, height, styles, palette):
    from reportlab.platypus import Paragraph, Table, TableStyle

    image = _receipt_product_image(file_field, width - 6, height - 6)
    box = Table(
        [[image or Paragraph("PRODUCT IMAGE<br/>UNAVAILABLE", styles["placeholder"])]],
        colWidths=[width],
        rowHeights=[height],
    )
    box.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), palette["surface_soft"]),
                ("BOX", (0, 0), (-1, -1), 0.8, palette["border"]),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 3),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return box


def _receipt_info_card(title, description, width, badge_text, styles, palette):
    from reportlab.platypus import Paragraph, Spacer

    return _receipt_card(
        [
            _receipt_badge(badge_text, styles, palette),
            Spacer(1, 8),
            Paragraph(_safe_receipt_text(title), styles["info_title"]),
            Spacer(1, 4),
            Paragraph(_safe_receipt_text(description), styles["info_text"]),
        ],
        width,
        palette,
        background="surface_soft",
        border="border",
        paddings=(12, 12, 11, 11),
    )


def _receipt_contact_card(label, value, width, styles, palette):
    from reportlab.platypus import Paragraph, Spacer

    return _receipt_card(
        [
            Paragraph(_safe_receipt_text(label), styles["label"]),
            Spacer(1, 4),
            Paragraph(_safe_receipt_text(value), styles["value_bold"]),
        ],
        width,
        palette,
        background="surface_soft",
        border="border",
        paddings=(12, 12, 11, 11),
    )


def _receipt_key_value_table(rows, width, styles, palette):
    from reportlab.platypus import Paragraph, Table, TableStyle

    table = Table(
        [
            [Paragraph(_safe_receipt_text(label), styles["label"]), Paragraph(_safe_receipt_text(value), styles["value_bold"])]
            for label, value in rows
        ],
        colWidths=[width * 0.42, width * 0.58],
    )
    table.setStyle(
        TableStyle(
            [
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, palette["border"]),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return table


def _receipt_product_image(file_field, width, height):
    from reportlab.platypus import Image as ReportLabImage

    try:
        if not file_field:
            return None
        if hasattr(file_field, "storage") and hasattr(file_field, "name") and not file_field.storage.exists(file_field.name):
            return None
        with file_field.storage.open(file_field.name, "rb") as image_file:
            image = ReportLabImage(BytesIO(image_file.read()), width=width, height=height)
            image.hAlign = "LEFT"
            return image
    except (AttributeError, OSError, TypeError, ValueError, SuspiciousOperation):
        return None


def build_receipt_pdf(sale):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        logger.warning("ReportLab is unavailable. Falling back to the basic receipt PDF generator.")
        return _build_basic_receipt_pdf(sale)

    payment = sale.payment
    palette = _receipt_palette()
    styles = _receipt_styles(palette)
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        pageCompression=0,
    )
    page_width = A4[0] - doc.leftMargin - doc.rightMargin
    column_gap = 6 * mm
    story = []
    control_number = getattr(payment, "control_number", None) or "Pending"
    created_at_text = sale.created_at.strftime("%d %b %Y, %H:%M") if getattr(sale, "created_at", None) else "Not provided"
    details_width = page_width * 0.66
    payment_width = page_width - details_width - column_gap
    detail_card_width = (details_width - 20 - column_gap) / 2

    header_status_card = _receipt_card(
        [
            Paragraph("Payment Confirmed", styles["status_label"]),
            Spacer(1, 4),
            Paragraph(f"Control #{_safe_receipt_text(control_number)}", styles["status_primary"]),
            Spacer(1, 3),
            Paragraph(f"Order #{sale.id}", styles["status_secondary"]),
            Paragraph(_safe_receipt_text(created_at_text), styles["status_secondary"]),
        ],
        payment_width - 8,
        palette,
        background="header_pill",
        border="header_pill_border",
        paddings=(12, 12, 10, 10),
    )
    header_status_card.hAlign = "RIGHT"

    header_table = Table(
        [
            [
                [
                    Paragraph("OFFICIAL CUSTOMER RECEIPT", styles["brand_kicker"]),
                    Paragraph(_safe_receipt_text(STORE_NAME), styles["brand_title"]),
                    Paragraph(_safe_receipt_text(STORE_SUBTITLE), styles["brand_subtitle"]),
                ],
                header_status_card,
            ]
        ],
        colWidths=[details_width, payment_width],
    )
    header_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), palette["accent"]),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.whitesmoke),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 16),
                ("RIGHTPADDING", (0, 0), (-1, -1), 16),
                ("TOPPADDING", (0, 0), (-1, -1), 16),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
                ("BOX", (0, 0), (-1, -1), 0.8, palette["accent_dark"]),
            ]
        )
    )
    story.extend([header_table, Spacer(1, 12)])

    detail_cards = [
        _receipt_data_card("Customer", sale.customer_name_display or "Customer", detail_card_width, styles, palette),
        _receipt_data_card("Email", sale.customer_email_display or "Not provided", detail_card_width, styles, palette),
        _receipt_data_card("Phone", sale.customer_phone_display or "Not provided", detail_card_width, styles, palette),
        _receipt_data_card("Address", sale.customer_address_display or "Not provided", detail_card_width, styles, palette),
        _receipt_data_card("Delivery", sale.delivery_location or "Not provided", detail_card_width, styles, palette),
        _receipt_data_card("Order Date", created_at_text, detail_card_width, styles, palette),
    ]
    details_grid = Table(
        [
            [detail_cards[0], detail_cards[1]],
            [detail_cards[2], detail_cards[3]],
            [detail_cards[4], detail_cards[5]],
        ],
        colWidths=[detail_card_width, detail_card_width],
    )
    details_grid.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), column_gap / 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    details_panel = _receipt_card(
        [
            _receipt_section_header("CUSTOMER & ORDER DETAILS", styles, palette),
            Spacer(1, 10),
            details_grid,
        ],
        details_width,
        palette,
        background="surface",
        border="border_strong",
        paddings=(14, 14, 14, 8),
    )

    payment_panel_content_width = payment_width - 28
    payment_breakdown = _receipt_key_value_table(
        [
            ("Status", "Confirmed"),
            ("Payment Method", _receipt_payment_method(sale.payment_method)),
            ("Control Number", control_number),
        ],
        payment_panel_content_width,
        styles,
        palette,
    )
    payment_panel = _receipt_card(
        [
            _receipt_section_header("PAYMENT", styles, palette),
            Spacer(1, 10),
            Paragraph("Confirmed", styles["success"]),
            Spacer(1, 4),
            Paragraph("Final Amount", styles["label"]),
            Paragraph(_receipt_money(sale.final_amount), styles["total"]),
            Spacer(1, 8),
            payment_breakdown,
        ],
        payment_width,
        palette,
        background="surface",
        border="border_strong",
        paddings=(14, 14, 14, 14),
    )

    summary_table = Table(
        [[details_panel, "", payment_panel]],
        colWidths=[details_width, column_gap, payment_width],
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend([summary_table, Spacer(1, 12)])

    story.extend([_receipt_section_header("PAID PRODUCTS", styles, palette), Spacer(1, 8)])
    image_width = 29 * mm
    amount_width = 38 * mm
    detail_width = page_width - image_width - amount_width
    for item in sale.items.all():
        product_copy = [
            Paragraph(_safe_receipt_text(item.product.name), styles["product_title"]),
            Spacer(1, 4),
            Paragraph(f"Quantity: {_safe_receipt_text(item.quantity)}", styles["product_meta"]),
            Paragraph(f"Unit Price: {_receipt_money(item.price)}", styles["product_meta"]),
            Paragraph(f"Paid Total: {_receipt_money(item.total)}", styles["product_meta"]),
        ]
        total_chip = _receipt_card(
            [
                Paragraph("PAID TOTAL", styles["label"]),
                Spacer(1, 5),
                Paragraph(_receipt_money(item.total), styles["total_small"]),
            ],
            amount_width - 16,
            palette,
            background="accent_tint",
            border="border_strong",
            paddings=(10, 10, 8, 8),
        )
        total_chip.hAlign = "RIGHT"
        item_table = Table(
            [
                [
                    _receipt_product_visual(getattr(item.product, "image", None), image_width - 8, image_width - 8, styles, palette),
                    product_copy,
                    total_chip,
                ]
            ],
            colWidths=[image_width, detail_width, amount_width],
        )
        item_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), palette["surface_strong"]),
                    ("BOX", (0, 0), (-1, -1), 0.8, palette["border"]),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 10),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ]
            )
        )
        story.extend([item_table, Spacer(1, 7)])

    totals_width = 82 * mm
    totals_table = _receipt_key_value_table(
        [
            ("Subtotal", _receipt_money(sale.total_amount)),
            ("Discount", _receipt_money(sale.discount)),
            ("Tax", _receipt_money(sale.tax)),
            ("Final Amount", _receipt_money(sale.final_amount)),
        ],
        totals_width - 24,
        styles,
        palette,
    )
    totals_card = _receipt_card(
        [
            _receipt_section_header("TOTALS", styles, palette),
            Spacer(1, 9),
            totals_table,
        ],
        totals_width,
        palette,
        background="surface",
        border="border_strong",
        paddings=(12, 12, 12, 12),
    )
    totals_card.hAlign = "RIGHT"
    story.extend([totals_card, Spacer(1, 12)])

    story.extend([_receipt_section_header("ABOUT US", styles, palette), Spacer(1, 8)])
    about_card_width = (page_width - column_gap * 2) / 3.0
    about_table = Table(
        [[
            _receipt_info_card(title, description, about_card_width, f"{index + 1:02d}", styles, palette)
            for index, (title, description) in enumerate(RECEIPT_ABOUT_CARDS)
        ]],
        colWidths=[about_card_width, about_card_width, about_card_width],
    )
    about_table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), column_gap / 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend([about_table, Spacer(1, 12)])

    story.extend([_receipt_section_header("CONTACT US", styles, palette), Spacer(1, 8)])
    contact_card_width = (page_width - column_gap * 2) / 3.0
    contact_table = Table(
        [[
            _receipt_contact_card("Phone", STORE_PHONE, contact_card_width, styles, palette),
            _receipt_contact_card("Email", STORE_EMAIL, contact_card_width, styles, palette),
            _receipt_contact_card("Location", STORE_LOCATION, contact_card_width, styles, palette),
        ]],
        colWidths=[contact_card_width, contact_card_width, contact_card_width],
    )
    contact_table.setStyle(
        TableStyle(
            [
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), column_gap / 2),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.extend(
        [
            contact_table,
            Spacer(1, 10),
            _receipt_card(
                Paragraph(
                    f"This receipt is issued because your payment has been confirmed by {STORE_NAME}.",
                    styles["small"],
                ),
                page_width,
                palette,
                background="accent_tint",
                border="border_strong",
                paddings=(12, 12, 10, 10),
            ),
        ]
    )

    def draw_receipt_page(canvas, document):
        canvas.saveState()
        canvas.setFillColor(palette["page"])
        canvas.rect(0, 0, *A4, fill=1, stroke=0)
        canvas.setFillColor(palette["surface_glow"])
        canvas.circle(A4[0] - 26 * mm, A4[1] - 24 * mm, 20 * mm, fill=1, stroke=0)
        canvas.setFillColor(palette["gold_soft"])
        canvas.circle(20 * mm, 18 * mm, 14 * mm, fill=1, stroke=0)
        canvas.setStrokeColor(palette["border_strong"])
        canvas.setLineWidth(0.8)
        canvas.roundRect(
            document.leftMargin - 5 * mm,
            document.bottomMargin - 5 * mm,
            A4[0] - document.leftMargin - document.rightMargin + 10 * mm,
            A4[1] - document.topMargin - document.bottomMargin + 10 * mm,
            10,
            fill=0,
            stroke=1,
        )
        canvas.setFillColor(palette["muted"])
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(A4[0] - document.rightMargin, 8 * mm, f"Receipt | Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_receipt_page, onLaterPages=draw_receipt_page)
    return buffer.getvalue()


class IsAdminRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsSupplierRole(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.role == "supplier"):
            return False
        if not user_has_active_scheduled_access(request.user):
            self.message = scheduled_access_denial_detail(request.user)
            return False
        return True


class IsAdminOrSupplierRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ("admin", "supplier")
        )


class IsDriverRole(permissions.BasePermission):
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated and request.user.role == "driver"):
            return False
        if not user_has_active_scheduled_access(request.user):
            self.message = scheduled_access_denial_detail(request.user)
            return False
        return True


class IsCustomerRole(permissions.BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "customer")


def token_payload_for_user(user):
    refresh = RefreshToken.for_user(user)
    return {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "user": serialize_or_raise(UserSerializer, user),
    }


class RoleLoginView(APIView):
    permission_classes = [permissions.AllowAny]
    required_role = None

    def post(self, request):
        try:
            username = request.data.get("username")
            password = request.data.get("password")
            user = authenticate(request=request, username=username, password=password)
            if not user:
                return Response({"detail": "Invalid credentials."}, status=status.HTTP_401_UNAUTHORIZED)
            if self.required_role and user.role != self.required_role:
                return Response({"detail": f"Only {self.required_role} can login here."}, status=status.HTTP_403_FORBIDDEN)
            if user_requires_scheduled_access(user) and not user_has_active_scheduled_access(user):
                return Response(
                    {"detail": scheduled_access_denial_detail(user)},
                    status=status.HTTP_403_FORBIDDEN,
                )
            return Response(token_payload_for_user(user), status=status.HTTP_200_OK)
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response({"detail": "Authentication is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class CustomerLoginView(RoleLoginView):
    required_role = "customer"


class CustomerGoogleLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not GOOGLE_CLIENT_ID:
            return Response(
                {"detail": "Google login is not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        credential = str(request.data.get("credential") or "").strip()
        if not credential:
            return Response({"detail": "Google credential is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            google_profile = _verify_google_credential(credential)
            user = _customer_user_from_google_profile(google_profile)
            return Response(token_payload_for_user(user), status=status.HTTP_200_OK)
        except exceptions.APIException:
            raise
        except ValueError:
            logger.exception("Google login failed because the token exchange response was invalid.")
            return Response({"detail": "Google login failed."}, status=status.HTTP_502_BAD_GATEWAY)
        except (HTTPError, URLError):
            logger.exception("Google login failed while contacting Google OAuth.")
            return Response({"detail": "Google login is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except DatabaseError:
            return Response({"detail": "Authentication is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AdminLoginView(RoleLoginView):
    required_role = "admin"


class SupplierLoginView(RoleLoginView):
    required_role = "supplier"


class DriverLoginView(RoleLoginView):
    required_role = "driver"


class SafeTokenRefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except exceptions.APIException:
            raise
        except Exception:
            logger.exception("Token refresh failed unexpectedly.")
            return Response(
                {"detail": "Session refresh failed. Please login again."},
                status=status.HTTP_401_UNAUTHORIZED,
            )


class RegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            serializer = RegisterSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            return Response(UserSerializer(user, context={"request": request}).data, status=status.HTTP_201_CREATED)
        except DatabaseError:
            return Response({"detail": "Registration is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class AdminRegisterView(APIView):
    permission_classes = [permissions.AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            serializer = AdminRegisterSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            return Response(UserSerializer(user, context={"request": request}).data, status=status.HTTP_201_CREATED)
        except DatabaseError:
            return Response({"detail": "Admin registration is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        try:
            enforce_scheduled_access_or_raise(request.user)
            return Response(
                serialize_or_raise(UserSerializer, request.user, context={"request": request}),
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response({"detail": "Profile service is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    def patch(self, request):
        try:
            enforce_scheduled_access_or_raise(request.user)
            serializer = UserSerializer(
                request.user,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response({"detail": "Profile update is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category", "supplier").all()
    serializer_class = ProductSerializer
    parser_classes = [MultiPartParser, FormParser]

    def get_permissions(self):
        if self.action in ("list", "retrieve", "image"):
            return [permissions.AllowAny()]
        if self.action in ("create", "update", "partial_update", "destroy"):
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated(), IsAdminRole()]

    def get_serializer_class(self):
        if self.action == "list":
            return PublicProductSerializer
        return ProductSerializer

    def _serialize_products(self, products):
        serializer_class = self.get_serializer_class()
        context = self.get_serializer_context()
        serialized_products = []

        for product in products:
            try:
                serialized_products.append(serializer_class(product, context=context).data)
            except PRODUCT_SERIALIZATION_ERRORS:
                logger.exception("Skipping product %s because serialization failed.", product.pk)

        return serialized_products

    def get_object(self):
        lookup_value = self.kwargs.get(self.lookup_field)
        queryset = self.filter_queryset(self.get_queryset())

        try:
            if lookup_value is not None and str(lookup_value).isdigit():
                obj = queryset.get(pk=int(lookup_value))
            else:
                obj = queryset.get(slug=lookup_value)
        except Product.DoesNotExist as exc:
            raise Http404 from exc

        self.check_object_permissions(self.request, obj)
        return obj

    def _product_storage_error_response(self, action_name):
        logger.exception("Product %s failed because uploaded media could not be saved.", action_name)
        return Response(
            {"detail": "Product image upload is temporarily unavailable."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    def list(self, request, *args, **kwargs):
        try:
            queryset = self.filter_queryset(self.get_queryset())
            page = self.paginate_queryset(queryset)
            products = page if page is not None else queryset
            data = self._serialize_products(products)

            if page is not None:
                return self.get_paginated_response(data)
            return Response(data, status=status.HTTP_200_OK)
        except DatabaseError:
            logger.exception("Products list is temporarily unavailable because the database query failed.")
            return Response(
                {"detail": "Products are temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    def retrieve(self, request, *args, **kwargs):
        try:
            instance = self.get_object()
            serializer = self.get_serializer(instance)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except DatabaseError:
            logger.exception("Product detail is temporarily unavailable because the database query failed.")
            return Response(
                {"detail": "This product is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except PRODUCT_SERIALIZATION_ERRORS:
            logger.exception("Product %s could not be serialized.", kwargs.get(self.lookup_field))
            return Response(
                {"detail": "This product is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    @action(detail=True, methods=["get"], permission_classes=[permissions.AllowAny])
    def image(self, request, pk=None):
        try:
            product = self.get_object()
        except Http404:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        except DatabaseError:
            return Response(
                {"detail": "This product image is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if getattr(product, "image_data", None):
            image_payload = bytes(product.image_data)
            response = HttpResponse(
                image_payload,
                content_type=product.image_content_type or "application/octet-stream",
            )
            if product.image_name:
                response["Content-Disposition"] = f'inline; filename="{product.image_name}"'
            response["Content-Length"] = str(len(image_payload))
            response["Cache-Control"] = "public, max-age=86400"
            return response

        return Response({"detail": "Product image not found."}, status=status.HTTP_404_NOT_FOUND)

    def create(self, request, *args, **kwargs):
        try:
            return super().create(request, *args, **kwargs)
        except OSError:
            return self._product_storage_error_response("create")

    def update(self, request, *args, **kwargs):
        try:
            return super().update(request, *args, **kwargs)
        except OSError:
            return self._product_storage_error_response("update")

    def partial_update(self, request, *args, **kwargs):
        try:
            return super().partial_update(request, *args, **kwargs)
        except OSError:
            return self._product_storage_error_response("update")

    def perform_create(self, serializer):
        if self.request.user.role == "supplier":
            supplier = Supplier.objects.filter(user=self.request.user).first()
            if not supplier:
                raise exceptions.PermissionDenied("Supplier profile is missing.")
            serializer.save(supplier=supplier)
            return
        if self.request.user.role != "admin":
            raise exceptions.PermissionDenied("Only admin or supplier can create products.")
        serializer.save()

    def _assert_can_manage_product(self, product):
        user = self.request.user
        if user.role == "admin":
            return
        if user.role == "supplier":
            supplier = Supplier.objects.filter(user=user).first()
            if not supplier:
                raise exceptions.PermissionDenied("Supplier profile is missing.")
            if product.supplier_id != supplier.id:
                raise exceptions.PermissionDenied("Suppliers can only manage their own products.")
            return
        raise exceptions.PermissionDenied("Only admin or supplier can manage products.")

    def perform_update(self, serializer):
        product = self.get_object()
        self._assert_can_manage_product(product)
        if self.request.user.role == "supplier":
            supplier = Supplier.objects.filter(user=self.request.user).first()
            serializer.save(supplier=supplier)
            return
        serializer.save()

    def perform_destroy(self, instance):
        self._assert_can_manage_product(instance)
        instance.delete()


class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.select_related("customer", "user", "assigned_driver").all()
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ("create", "update", "partial_update", "destroy", "assign_driver"):
            return [permissions.IsAuthenticated(), IsAdminRole()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if user.role == "admin":
            return self.queryset
        if user.role == "driver":
            return self.queryset.filter(assigned_driver=user)
        if user.role == "customer":
            return self.queryset.filter(user=user)
        return self.queryset.none()

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdminRole])
    def assign_driver(self, request, pk=None):
        try:
            sale = self.get_object()
            driver_id = request.data.get("driver_id")
            driver = User.objects.filter(id=driver_id, role="driver").first()
            if not driver:
                return Response({"detail": "Driver not found."}, status=status.HTTP_404_NOT_FOUND)
            sale.assigned_driver = driver
            if sale.status in ("payment_confirmed", "processing"):
                sale.status = "out_for_delivery"
            sale.save(update_fields=["assigned_driver", "status"])
            return Response(
                serialize_or_raise(SaleSerializer, sale, context={"request": request}),
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Driver assignment is temporarily unavailable.",
                log_message="Sale driver assignment failed because the database or serializer was unavailable.",
            )


class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = SaleItem.objects.select_related("sale", "product").all()
    serializer_class = SaleItemSerializer
    permission_classes = [permissions.IsAuthenticated]


class StockViewSet(viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related("product", "sale_item").all()
    serializer_class = StockSerializer
    permission_classes = [permissions.IsAuthenticated]


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related("sale", "confirmed_by").all()
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action in ("admin_pending",):
            return PaymentAdminSerializer
        return PaymentSerializer

    def get_queryset(self):
        user = self.request.user
        if user.role == "admin":
            return self.queryset
        if user.role == "customer":
            return self.queryset.filter(sale__user=user)
        return self.queryset.none()

    def _supplier_reviewable_payments(self, user):
        supplier = Supplier.objects.filter(user=user).first()
        if not supplier:
            return self.queryset.none()
        return (
            self.queryset.filter(sale__items__product__supplier=supplier)
            .select_related("sale", "sale__user", "confirmed_by")
            .prefetch_related("sale__items__product")
            .distinct()
        )

    def _payment_for_confirmation(self, user, pk):
        if user.role == "admin":
            return self.queryset.filter(pk=pk).first()
        if user.role == "supplier":
            return self._supplier_reviewable_payments(user).filter(pk=pk).first()
        return None

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated, IsAdminOrSupplierRole])
    def confirm(self, request, pk=None):
        try:
            payment = self._payment_for_confirmation(request.user, pk)
            if not payment:
                return Response({"detail": "Payment not found."}, status=status.HTTP_404_NOT_FOUND)
            if payment.status == "confirmed":
                return Response(serialize_or_raise(PaymentSerializer, payment), status=status.HTTP_200_OK)
            if payment.status != "pending":
                return Response(
                    {"detail": "Only pending payments can be confirmed."},
                    status=status.HTTP_409_CONFLICT,
                )

            payment.status = "confirmed"
            payment.confirmed_by = request.user
            payment.save()

            sale = payment.sale
            sale.payment_confirmed = True
            if sale.status == "pending_payment":
                sale.status = "payment_confirmed"
            sale.save()
            _auto_assign_sale_to_sole_driver(sale)

            customer_name = (
                sale.customer_name_display
                if sale.customer_name_display
                else "Customer"
            )
            customer_email = sale.customer_email_display
            if customer_email:
                subject = f"Payment Confirmed - Control #{payment.control_number}"
                message = (
                    f"Hello {customer_name},\n\n"
                    f"Your payment is confirmed.\n"
                    f"Control Number: {payment.control_number}\n"
                    f"Order ID: {sale.id}\n"
                    f"Total: {sale.final_amount}\n"
                    f"Delivery location: {sale.delivery_location or 'Not provided'}\n"
                    f"Thank you for shopping with {STORE_NAME}."
                )
                send_mail(
                    subject=subject,
                    message=message,
                    from_email="noreply@zansupermarket.local",
                    recipient_list=[customer_email],
                    fail_silently=True,
                )
            return Response(serialize_or_raise(PaymentSerializer, payment), status=status.HTTP_200_OK)
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Payment confirmation is temporarily unavailable.",
                log_message="Payment confirmation failed because the database or serializer was unavailable.",
            )

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated, IsAdminRole])
    def admin_pending(self, request):
        try:
            payments = self.queryset.filter(status="pending").select_related("sale", "sale__user")
            serializer = self.get_serializer(payments, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Pending payments are temporarily unavailable.",
                log_message="Admin pending payments failed because the database or serializer was unavailable.",
            )


class AdminCreateUserView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            serializer = AdminCreateUserSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.save()
            return Response(
                serialize_or_raise(UserSerializer, user, context={"request": request}),
                status=status.HTTP_201_CREATED,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response({"detail": "User creation is temporarily unavailable."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)


class ScheduledAccessListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def get(self, request):
        try:
            users = User.objects.filter(role__in=SCHEDULED_ACCESS_ROLES).order_by("role", "full_name", "username")
            return Response(
                serialize_or_raise(ScheduledAccessSerializer, users, many=True, context={"request": request}),
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response(
                {"detail": "Scheduled access list is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class ScheduledAccessDetailView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsAdminRole]

    def patch(self, request, user_id):
        try:
            user = User.objects.filter(id=user_id, role__in=SCHEDULED_ACCESS_ROLES).first()
            if not user:
                return Response({"detail": "Scheduled user not found."}, status=status.HTTP_404_NOT_FOUND)

            serializer = ScheduledAccessSerializer(
                user,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return Response(
                {"detail": "Scheduled access update is temporarily unavailable."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )


class CheckoutView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomerRole]

    def _checkout_unavailable_response(self):
        logger.exception("Customer checkout failed because the database transaction could not complete.")
        return Response(
            {"detail": "Unable to place this order right now. Please try again shortly."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    @transaction.atomic
    def post(self, request):
        try:
            serializer = CheckoutSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data

            customer = Customer.objects.filter(user=request.user).first()
            if not customer:
                customer = Customer.objects.create(user=request.user, phone=request.user.phone)

            items_payload = data["items"]
            if not items_payload:
                return Response({"detail": "Cart is empty."}, status=status.HTTP_400_BAD_REQUEST)

            product_ids = [item["product"] for item in items_payload]
            product_map = {
                product.id: product
                for product in Product.objects.select_for_update().filter(id__in=product_ids)
            }
            total_amount = Decimal("0.00")
            sale_items = []
            customer_full_name = data.get("customer_full_name") or request.user.full_name or request.user.username
            customer_email = data.get("customer_email") or request.user.email or ""
            customer_phone = data.get("customer_phone") or request.user.phone or ""
            customer_address = data.get("customer_address") or request.user.address or ""

            for item in items_payload:
                product = product_map.get(item["product"])
                if not product:
                    return Response({"detail": f"Product {item['product']} not found."}, status=status.HTTP_400_BAD_REQUEST)
                qty = item["quantity"]
                if product.quantity < qty:
                    return Response({"detail": f"Not enough stock for {product.name}."}, status=status.HTTP_400_BAD_REQUEST)
                total_amount += product.price * qty
                sale_items.append((product, qty))

            sale = Sale.objects.create(
                customer=customer,
                user=request.user,
                total_amount=total_amount,
                tax=Decimal("0.00"),
                discount=Decimal("0.00"),
                final_amount=total_amount,
                payment_method=data.get("payment_method", "mobile_money"),
                payment_confirmed=True,
                delivery_location=data.get("delivery_location", ""),
                terms_accepted=data.get("terms_accepted", False),
                customer_full_name=customer_full_name,
                customer_email=customer_email,
                customer_phone=customer_phone,
                customer_address=customer_address,
                status="payment_confirmed",
            )

            for product, qty in sale_items:
                sale_item = SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    quantity=qty,
                    price=product.price,
                    total=product.price * qty,
                )
                product.quantity -= qty
                product.save(update_fields=["quantity"])
                StockMovement.objects.create(product=product, sale_item=sale_item, quantity=qty, movement_type="OUT")

            payment = Payment.objects.create(
                sale=sale,
                payment_method=data.get("payment_method", "mobile_money"),
                status="confirmed",
            )

            _auto_assign_sale_to_sole_driver(sale)

            items_text = "\n".join(
                [f"- {product.name} x{qty} @ {product.price} = {product.price * qty}" for product, qty in sale_items]
            )
            subject = f"Order Received - Control #{payment.control_number}"
            message = (
                f"Hello {customer_full_name},\n\n"
                f"Your payment was confirmed successfully.\n"
                f"Order ID: {sale.id}\n"
                f"Control Number: {payment.control_number}\n"
                f"Payment Method: {payment.payment_method}\n"
                f"Payment Status: {payment.status}\n"
                f"Total: {sale.final_amount}\n"
                f"Phone: {customer_phone or 'Not provided'}\n"
                f"Address: {customer_address or 'Not provided'}\n"
                f"Delivery location: {sale.delivery_location or 'Not provided'}\n\n"
                f"Items:\n{items_text}\n\n"
                f"Your receipt is now available. Thank you for shopping with {STORE_NAME}."
            )
            recipient_email = customer_email or request.user.email or ""
            if recipient_email:
                send_mail(
                    subject=subject,
                    message=message,
                    from_email="noreply@zansupermarket.local",
                    recipient_list=[recipient_email],
                    fail_silently=True,
                )

            return Response(
                {
                    "sale": serialize_or_raise(SaleSerializer, sale, context={"request": request}),
                    "payment": serialize_or_raise(PaymentSerializer, payment, context={"request": request}),
                    "whatsapp_url": build_whatsapp_order_url(sale, payment, sale_items),
                },
                status=status.HTTP_201_CREATED,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return self._checkout_unavailable_response()


class CustomerOrdersView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomerRole]

    def get(self, request):
        try:
            sales = (
                Sale.objects.filter(user=request.user, customer_history_hidden=False)
                .select_related("payment")
                .prefetch_related("items__product")
            )
            return Response(
                serialize_or_raise(SaleSerializer, sales, many=True, context={"request": request}),
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Order history is temporarily unavailable.",
                log_message="Customer orders failed because the database or serializer was unavailable.",
            )

    def delete(self, request):
        try:
            hidden_count = Sale.objects.filter(user=request.user, customer_history_hidden=False).update(
                customer_history_hidden=True
            )
            return Response({"detail": "Order history deleted.", "hidden_count": hidden_count}, status=status.HTTP_200_OK)
        except DatabaseError:
            return api_unavailable_response(
                "Order history could not be deleted right now.",
                log_message="Customer order history delete failed because the database was unavailable.",
            )


class CustomerOrderHistoryItemView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomerRole]

    def delete(self, request, sale_id):
        try:
            hidden_count = Sale.objects.filter(
                id=sale_id, user=request.user, customer_history_hidden=False
            ).update(customer_history_hidden=True)
            if not hidden_count:
                return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
            return Response({"detail": "Order history item deleted."}, status=status.HTTP_200_OK)
        except DatabaseError:
            return api_unavailable_response(
                "Order history item could not be deleted right now.",
                log_message="Customer order history item delete failed because the database was unavailable.",
            )


class CustomerReceiptView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCustomerRole]

    def get(self, request, sale_id):
        try:
            sale = (
                Sale.objects.filter(id=sale_id, user=request.user)
                .select_related("payment")
                .prefetch_related("items__product")
                .first()
            )
            if not sale:
                return Response({"detail": "Order not found."}, status=status.HTTP_404_NOT_FOUND)
            payment = getattr(sale, "payment", None)
            if not payment or payment.status != "confirmed":
                return Response(
                    {"detail": "Receipt is available after payment confirmation."},
                    status=status.HTTP_409_CONFLICT,
                )

            response = HttpResponse(build_receipt_pdf(sale), content_type="application/pdf")
            response["Content-Disposition"] = f'attachment; filename="receipt-order-{sale.id}.pdf"'
            return response
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Receipt service is temporarily unavailable.",
                log_message="Customer receipt failed because the database or serializer was unavailable.",
            )


def _supplier_pending_payments_queryset(supplier):
    return (
        Payment.objects.filter(status="pending", sale__items__product__supplier=supplier)
        .select_related("sale", "sale__user")
        .prefetch_related("sale__items__product")
        .distinct()
    )


def _driver_active_deliveries_queryset(user):
    return (
        Sale.objects.filter(assigned_driver=user)
        .exclude(status="delivered")
        .select_related("payment", "user")
    )


def _auto_assign_ready_sales_to_sole_driver(user):
    if not user or getattr(user, "role", None) != "driver" or not getattr(user, "is_active", False):
        return

    active_driver_ids = list(
        User.objects.filter(role="driver", is_active=True).order_by("id").values_list("id", flat=True)[:2]
    )
    if active_driver_ids != [user.id]:
        return

    Sale.objects.filter(
        assigned_driver__isnull=True,
        status__in=("payment_confirmed", "processing"),
    ).update(assigned_driver=user, status="out_for_delivery")
    Sale.objects.filter(
        assigned_driver__isnull=True,
        status="out_for_delivery",
    ).update(assigned_driver=user)


def _auto_assign_sale_to_sole_driver(sale):
    if sale.assigned_driver_id or sale.status not in ("payment_confirmed", "processing", "out_for_delivery"):
        return

    active_drivers = list(User.objects.filter(role="driver", is_active=True).order_by("id")[:2])
    if len(active_drivers) != 1:
        return

    sale.assigned_driver = active_drivers[0]
    update_fields = ["assigned_driver"]
    if sale.status in ("payment_confirmed", "processing"):
        sale.status = "out_for_delivery"
        update_fields.append("status")
    sale.save(update_fields=update_fields)


class SupplierDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupplierRole]

    def get(self, request):
        try:
            supplier = Supplier.objects.filter(user=request.user).first()
            if not supplier:
                return Response({"detail": "Supplier profile not found."}, status=status.HTTP_404_NOT_FOUND)
            products = Product.objects.filter(supplier=supplier)
            low_stock = products.filter(quantity__lte=5).count()
            pending_payments = _supplier_pending_payments_queryset(supplier)
            return Response(
                {
                    "supplier": serialize_or_raise(SupplierSerializer, supplier),
                    "products_count": products.count(),
                    "low_stock_count": low_stock,
                    "pending_payments_count": pending_payments.count(),
                    "pending_payments": serialize_or_raise(
                        PaymentAdminSerializer,
                        pending_payments,
                        many=True,
                        context={"request": request},
                    ),
                    "products": serialize_or_raise(
                        ProductSerializer,
                        products,
                        many=True,
                        context={"request": request},
                    ),
                },
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Supplier dashboard is temporarily unavailable.",
                log_message="Supplier dashboard failed because the database or serializer was unavailable.",
            )


class SupplierAlertsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupplierRole]

    def get(self, request):
        try:
            supplier = Supplier.objects.filter(user=request.user).first()
            if not supplier:
                return Response({"detail": "Supplier profile not found."}, status=status.HTTP_404_NOT_FOUND)

            pending_payments = _supplier_pending_payments_queryset(supplier).order_by("-created_at")[:25]
            alerts = [
                {
                    "id": payment.id,
                    "type": "supplier_order",
                    "sale_id": payment.sale_id,
                    "customer_name": payment.sale.customer_name_display or "Customer",
                    "delivery_location": payment.sale.delivery_location or payment.sale.customer_address_display or "",
                    "status": payment.status,
                    "created_at": payment.created_at.isoformat(),
                }
                for payment in pending_payments
            ]
            return Response(
                {
                    "alerts": alerts,
                    "pending_count": len(alerts),
                },
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Supplier alerts are temporarily unavailable.",
                log_message="Supplier alerts failed because the database or serializer was unavailable.",
            )


class DriverDashboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsDriverRole]

    def get(self, request):
        try:
            _auto_assign_ready_sales_to_sole_driver(request.user)
            sales = _driver_active_deliveries_queryset(request.user)
            return Response(
                {
                    "driver": serialize_or_raise(UserSerializer, request.user, context={"request": request}),
                    "active_deliveries": serialize_or_raise(
                        SaleSerializer,
                        sales,
                        many=True,
                        context={"request": request},
                    ),
                },
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Driver dashboard is temporarily unavailable.",
                log_message="Driver dashboard failed because the database or serializer was unavailable.",
            )


class DriverAlertsView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsDriverRole]

    def get(self, request):
        try:
            _auto_assign_ready_sales_to_sole_driver(request.user)
            sales = _driver_active_deliveries_queryset(request.user).order_by("-created_at")[:25]
            alerts = [
                {
                    "id": sale.id,
                    "type": "driver_delivery",
                    "sale_id": sale.id,
                    "customer_name": sale.customer_name_display or "Customer",
                    "delivery_location": sale.delivery_location or sale.customer_address_display or "",
                    "status": sale.status,
                    "created_at": sale.created_at.isoformat(),
                }
                for sale in sales
            ]
            return Response(
                {
                    "alerts": alerts,
                    "active_count": len(alerts),
                },
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Driver alerts are temporarily unavailable.",
                log_message="Driver alerts failed because the database or serializer was unavailable.",
            )


class DriverUpdateDeliveryView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsDriverRole]

    def patch(self, request, sale_id):
        try:
            sale = Sale.objects.filter(id=sale_id, assigned_driver=request.user).first()
            if not sale:
                return Response({"detail": "Delivery not found."}, status=status.HTTP_404_NOT_FOUND)
            next_status = request.data.get("status")
            if next_status not in ("out_for_delivery", "delivered"):
                return Response({"detail": "Invalid status for driver."}, status=status.HTTP_400_BAD_REQUEST)
            sale.status = next_status
            sale.save(update_fields=["status"])
            return Response(
                serialize_or_raise(SaleSerializer, sale, context={"request": request}),
                status=status.HTTP_200_OK,
            )
        except (DatabaseError, API_SERIALIZATION_ERRORS):
            return api_unavailable_response(
                "Delivery update is temporarily unavailable.",
                log_message="Driver delivery update failed because the database or serializer was unavailable.",
            )
