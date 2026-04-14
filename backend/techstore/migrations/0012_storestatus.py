from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


def create_default_store_status(apps, schema_editor):
    StoreStatus = apps.get_model("techstore", "StoreStatus")
    if not StoreStatus.objects.exists():
        StoreStatus.objects.create(is_open=True)


class Migration(migrations.Migration):

    dependencies = [
        ("techstore", "0011_customuser_access_window"),
    ]

    operations = [
        migrations.CreateModel(
            name="StoreStatus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("is_open", models.BooleanField(default=True)),
                ("scheduled_open_at", models.DateTimeField(blank=True, null=True)),
                ("scheduled_close_at", models.DateTimeField(blank=True, null=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now, editable=False)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="store_status_updates",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["-updated_at"]},
        ),
        migrations.RunPython(create_default_store_status, migrations.RunPython.noop),
    ]
