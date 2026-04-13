from io import BytesIO

from django.db import migrations
from PIL import Image, ImageOps


MAX_PRODUCT_IMAGE_BYTES = 1024 * 1024
MAX_PRODUCT_IMAGE_DIMENSION = 1600
MIN_PRODUCT_IMAGE_DIMENSION = 96
PRODUCT_IMAGE_QUALITIES = (85, 78, 70, 62, 54, 46, 38, 30)


def image_to_rgb(image):
    image = ImageOps.exif_transpose(image)
    if image.mode in ("RGBA", "LA") or "transparency" in image.info:
        rgba_image = image.convert("RGBA")
        background = Image.new("RGB", rgba_image.size, (255, 255, 255))
        background.paste(rgba_image, mask=rgba_image.getchannel("A"))
        return background
    if image.mode != "RGB":
        return image.convert("RGB")
    return image


def encode_jpeg(image, quality):
    output = BytesIO()
    image.save(output, format="JPEG", quality=quality, optimize=True, progressive=True)
    return output.getvalue()


def compress_product_image(image):
    image = image_to_rgb(image)
    image.thumbnail((MAX_PRODUCT_IMAGE_DIMENSION, MAX_PRODUCT_IMAGE_DIMENSION), Image.Resampling.LANCZOS)
    best_payload = None

    while True:
        for quality in PRODUCT_IMAGE_QUALITIES:
            payload = encode_jpeg(image, quality)
            if len(payload) <= MAX_PRODUCT_IMAGE_BYTES:
                return payload
            if best_payload is None or len(payload) < len(best_payload):
                best_payload = payload

        width, height = image.size
        if max(width, height) <= MIN_PRODUCT_IMAGE_DIMENSION:
            return best_payload

        scale = max(0.65, (MAX_PRODUCT_IMAGE_BYTES / len(best_payload)) ** 0.5 * 0.92)
        next_size = (
            max(MIN_PRODUCT_IMAGE_DIMENSION, int(width * scale)),
            max(MIN_PRODUCT_IMAGE_DIMENSION, int(height * scale)),
        )
        if next_size == image.size:
            return best_payload
        image = image.resize(next_size, Image.Resampling.LANCZOS)


def compress_existing_product_images(apps, schema_editor):
    Product = apps.get_model("supermarketzanzibar", "Product")
    for product in Product.objects.exclude(image_data__isnull=True).iterator():
        source_payload = bytes(product.image_data or b"")
        if not source_payload or len(source_payload) <= MAX_PRODUCT_IMAGE_BYTES:
            continue
        try:
            with Image.open(BytesIO(source_payload)) as image:
                compressed_payload = compress_product_image(image)
        except Exception:
            continue
        if compressed_payload and len(compressed_payload) < len(source_payload):
            product.image_data = compressed_payload
            product.image_content_type = "image/jpeg"
            if not product.image_name:
                product.image_name = f"product-{product.pk}.jpg"
            elif not product.image_name.lower().endswith(".jpg"):
                product.image_name = f"{product.image_name.rsplit('.', 1)[0]}.jpg"
            product.save(update_fields=["image_data", "image_name", "image_content_type"])


class Migration(migrations.Migration):
    dependencies = [
        ("supermarketzanzibar", "0007_emailotp"),
    ]

    operations = [
        migrations.RunPython(compress_existing_product_images, migrations.RunPython.noop),
    ]
