from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("supermarketzanzibar", "0010_sale_customer_history_hidden"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="access_window_end",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="customuser",
            name="access_window_start",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
