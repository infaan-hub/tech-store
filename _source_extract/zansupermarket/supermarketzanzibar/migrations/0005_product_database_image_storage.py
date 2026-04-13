import mimetypes
import os

from django.db import migrations, models


def migrate_product_files_to_database(apps, schema_editor):
    Product = apps.get_model("supermarketzanzibar", "Product")

    for product in Product.objects.exclude(image="").exclude(image__isnull=True):
        if product.image_data:
            continue

        image_name = str(product.image)
        image_field = getattr(product, "image", None)
        storage = getattr(image_field, "storage", None)
        if not image_name or storage is None or not storage.exists(image_name):
            continue

        with storage.open(image_name, "rb") as handle:
            product.image_data = handle.read()

        product.image_name = os.path.basename(image_name)
        product.image_content_type = mimetypes.guess_type(product.image_name)[0] or "application/octet-stream"
        product.save(update_fields=["image_data", "image_name", "image_content_type"])


class Migration(migrations.Migration):

    dependencies = [
        ("supermarketzanzibar", "0004_sale_customer_snapshot"),
    ]

    operations = [
        migrations.AddField(
            model_name="product",
            name="image_content_type",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="product",
            name="image_data",
            field=models.BinaryField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="product",
            name="image_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
        migrations.RunPython(migrate_product_files_to_database, migrations.RunPython.noop),
    ]
