from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("supermarketzanzibar", "0009_delete_emailotp"),
    ]

    operations = [
        migrations.AddField(
            model_name="sale",
            name="customer_history_hidden",
            field=models.BooleanField(default=False),
        ),
    ]
