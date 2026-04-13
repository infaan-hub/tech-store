import django.db.models.deletion
import django.utils.timezone
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("supermarketzanzibar", "0006_database_only_image_storage"),
    ]

    operations = [
        migrations.CreateModel(
            name="EmailOTP",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("email", models.EmailField(blank=True, default="", max_length=254)),
                ("otp_code_hash", models.CharField(max_length=64)),
                ("session_token", models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ("purpose", models.CharField(choices=[("google_login", "Google Login")], default="google_login", max_length=40)),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField()),
                ("resend_available_at", models.DateTimeField()),
                ("is_verified", models.BooleanField(default=False)),
                (
                    "user",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="email_otps", to="supermarketzanzibar.customuser"),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
