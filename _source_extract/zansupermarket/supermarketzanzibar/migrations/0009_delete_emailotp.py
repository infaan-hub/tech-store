from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("supermarketzanzibar", "0008_compress_existing_product_images"),
    ]

    operations = [
        migrations.DeleteModel(
            name="EmailOTP",
        ),
    ]
