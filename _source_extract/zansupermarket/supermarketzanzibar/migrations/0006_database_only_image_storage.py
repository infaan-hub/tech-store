import mimetypes
import os

from django.db import migrations, models
from django.core.files.storage.handler import InvalidStorageError


def _read_field_bytes(instance, field_name):
    file_field = getattr(instance, field_name, None)
    try:
        storage = getattr(file_field, "storage", None)
    except (AttributeError, InvalidStorageError):
        return None, "", ""
    file_name = str(file_field or "")
    if not file_name or storage is None or not storage.exists(file_name):
        return None, "", ""

    try:
        with storage.open(file_name, "rb") as handle:
            payload = handle.read()
    except (OSError, InvalidStorageError):
        return None, "", ""

    base_name = os.path.basename(file_name)
    content_type = mimetypes.guess_type(base_name)[0] or "application/octet-stream"
    return payload, base_name, content_type


def migrate_files_to_database(apps, schema_editor):
    CustomUser = apps.get_model("supermarketzanzibar", "CustomUser")
    Product = apps.get_model("supermarketzanzibar", "Product")
    Payment = apps.get_model("supermarketzanzibar", "Payment")

    for user in CustomUser.objects.exclude(profile_image="").exclude(profile_image__isnull=True):
        if user.profile_image_data:
            continue
        payload, name, content_type = _read_field_bytes(user, "profile_image")
        if payload is None:
            continue
        user.profile_image_data = payload
        user.profile_image_name = name
        user.profile_image_content_type = content_type
        user.save(update_fields=["profile_image_data", "profile_image_name", "profile_image_content_type"])

    for product in Product.objects.exclude(image="").exclude(image__isnull=True):
        if product.image_data:
            continue
        payload, name, content_type = _read_field_bytes(product, "image")
        if payload is None:
            continue
        product.image_data = payload
        product.image_name = name
        product.image_content_type = content_type
        product.save(update_fields=["image_data", "image_name", "image_content_type"])

    for payment in Payment.objects.exclude(proof_image="").exclude(proof_image__isnull=True):
        if payment.proof_image_data:
            continue
        payload, name, content_type = _read_field_bytes(payment, "proof_image")
        if payload is None:
            continue
        payment.proof_image_data = payload
        payment.proof_image_name = name
        payment.proof_image_content_type = content_type
        payment.save(update_fields=["proof_image_data", "proof_image_name", "proof_image_content_type"])


class Migration(migrations.Migration):

    dependencies = [
        ("supermarketzanzibar", "0005_product_database_image_storage"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="profile_image_content_type",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="customuser",
            name="profile_image_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customuser",
            name="profile_image_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.AddField(
            model_name="payment",
            name="proof_image_content_type",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="payment",
            name="proof_image_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="payment",
            name="proof_image_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(migrate_files_to_database, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="customuser",
            name="profile_image",
        ),
        migrations.RemoveField(
            model_name="payment",
            name="proof_image",
        ),
        migrations.RemoveField(
            model_name="product",
            name="image",
        ),
    ]
