import shutil
from io import BytesIO
from urllib.parse import urlsplit
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from zansupermarket import settings as project_settings
from .models import Category, Customer, MAX_PRODUCT_IMAGE_BYTES, Payment, Product, Sale, Supplier
from .serializers import ProductSerializer, PublicProductSerializer, safe_media_url

User = get_user_model()


class BrokenFile:
    def __bool__(self):
        return True

    @property
    def url(self):
        raise ValueError("broken media path")


class SafeMediaUrlTests(TestCase):
    def test_returns_none_for_broken_media_field(self):
        self.assertIsNone(safe_media_url(BrokenFile()))

    def test_returns_none_without_filesystem_media_support(self):
        self.assertIsNone(safe_media_url(object()))

    def test_product_serializer_keeps_image_field_writeable(self):
        self.assertFalse(ProductSerializer().fields["image"].read_only)


@override_settings(ALLOWED_HOSTS=["testserver", "127.0.0.1", "localhost"])
class ProductApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Groceries")
        self.supplier_user = User.objects.create_user(
            username="supplier-test",
            email="supplier-test@example.com",
            password="pass12345",
            full_name="Supplier Test",
            phone="255700000001",
            role="supplier",
        )
        Supplier.objects.create(
            user=self.supplier_user,
            company_name="Supplier Test Co",
            phone=self.supplier_user.phone,
            address="Stone Town",
        )

    def create_product(self, **overrides):
        defaults = {
            "name": "Rice",
            "slug": "rice",
            "category": self.category,
            "price": "2000.00",
            "cost_price": "1500.00",
            "quantity": 25,
            "barcode": "rice-001",
            "description": "Imported rice",
        }
        defaults.update(overrides)
        return Product.objects.create(**defaults)

    def product_image_upload(self, name="product.png", size=(2400, 2400)):
        output = BytesIO()
        image = Image.effect_noise(size, 100).convert("RGB")
        image.save(output, format="PNG")
        return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")

    def test_public_products_list_returns_public_payload(self):
        product = self.create_product()

        response = self.client.get("/api/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], product.id)
        self.assertEqual(response.data[0]["category_name"], self.category.name)
        self.assertEqual(response.data[0]["image"], None)
        self.assertIsNone(response.data[0]["image_url"])

    def test_public_products_list_omits_missing_image_urls(self):
        self.create_product(
            name="Broken Image Product",
            slug="broken-image-product",
            barcode="broken-image-001",
        )

        response = self.client.get("/api/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["image"], None)
        self.assertIsNone(response.data[0]["image_url"])

    def test_public_products_list_skips_products_that_fail_serialization(self):
        good_product = self.create_product(name="Sugar", slug="sugar", barcode="sugar-001")
        broken_product = self.create_product(name="Salt", slug="salt", barcode="salt-001")
        original_to_representation = PublicProductSerializer.to_representation

        def flaky_to_representation(serializer, instance):
            if instance.pk == broken_product.pk:
                raise ValueError("broken product payload")
            return original_to_representation(serializer, instance)

        with patch.object(
            PublicProductSerializer,
            "to_representation",
            autospec=True,
            side_effect=flaky_to_representation,
        ):
            response = self.client.get("/api/products/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([item["id"] for item in response.data], [good_product.id])

    def test_public_products_list_returns_503_when_database_fails(self):
        with patch("supermarketzanzibar.views.ProductViewSet.get_queryset", side_effect=DatabaseError("db down")):
            response = self.client.get("/api/products/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "Products are temporarily unavailable.")

    def test_public_product_detail_returns_503_when_database_fails(self):
        product = self.create_product()

        with patch("supermarketzanzibar.views.ProductViewSet.get_object", side_effect=DatabaseError("db down")):
            response = self.client.get(f"/api/products/{product.id}/")

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "This product is temporarily unavailable.")

    def test_supplier_can_create_product_with_image(self):
        self.client.force_authenticate(user=self.supplier_user)
        image = self.product_image_upload("large-product.png")

        response = self.client.post(
            "/api/products/",
            {
                "name": "Fresh Mango",
                "category": str(self.category.id),
                "price": "4500.00",
                "cost_price": "3000.00",
                "quantity": "8",
                "barcode": "fresh-mango-001",
                "description": "Sweet mangoes",
                "image": image,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "Fresh Mango")
        self.assertTrue(response.data["image"])
        self.assertTrue(response.data["image_url"])
        self.assertFalse(response.data["image"].startswith("data:image/"))
        self.assertIn(f"/api/products/{response.data['id']}/image/", response.data["image"])
        product = Product.objects.get(pk=response.data["id"])
        self.assertTrue(product.image_data)
        self.assertLessEqual(len(product.image_data), MAX_PRODUCT_IMAGE_BYTES)
        self.assertEqual(product.image_content_type, "image/jpeg")
        self.assertEqual(product.image_name, "large-product.jpg")

    def test_uploaded_product_image_is_in_products_and_supplier_dashboard_payloads(self):
        self.client.force_authenticate(user=self.supplier_user)
        image = self.product_image_upload("pineapple.png")

        create_response = self.client.post(
            "/api/products/",
            {
                "name": "Fresh Pineapple",
                "category": str(self.category.id),
                "price": "5500.00",
                "cost_price": "3600.00",
                "quantity": "9",
                "barcode": "fresh-pineapple-001",
                "description": "Sweet pineapple",
                "image": image,
            },
            format="multipart",
        )
        list_response = self.client.get("/api/products/")
        dashboard_response = self.client.get("/api/supplier/dashboard/")

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(list_response.data[0]["image"])
        self.assertTrue(list_response.data[0]["image_url"])
        self.assertTrue(list_response.data[0]["updated_at"])
        self.assertTrue(dashboard_response.data["products"][0]["image"])
        self.assertTrue(dashboard_response.data["products"][0]["image_url"])
        self.assertFalse(list_response.data[0]["image"].startswith("data:image/"))
        self.assertFalse(dashboard_response.data["products"][0]["image"].startswith("data:image/"))
        self.assertIn(f"/api/products/{create_response.data['id']}/image/", list_response.data[0]["image_url"])

    def test_uploaded_product_image_is_served_when_debug_is_false(self):
        self.client.force_authenticate(user=self.supplier_user)
        image = self.product_image_upload("orange.png")

        with override_settings(DEBUG=False):
            create_response = self.client.post(
                "/api/products/",
                {
                    "name": "Fresh Orange",
                    "category": str(self.category.id),
                    "price": "3200.00",
                    "cost_price": "2000.00",
                    "quantity": "12",
                    "barcode": "fresh-orange-001",
                    "description": "Juicy oranges",
                    "image": image,
                },
                format="multipart",
            )

            media_path = urlsplit(create_response.data["image"]).path
            image_response = self.client.get(media_path)

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(image_response.status_code, status.HTTP_200_OK)
        self.assertEqual(image_response.headers["Content-Type"], "image/jpeg")

    def test_product_create_returns_503_when_storage_fails(self):
        self.client.force_authenticate(user=self.supplier_user)

        with patch("supermarketzanzibar.views.ProductViewSet.perform_create", side_effect=PermissionError("disk denied")):
            response = self.client.post(
                "/api/products/",
                {
                    "name": "Fresh Lemon",
                    "category": str(self.category.id),
                    "price": "1500.00",
                    "cost_price": "900.00",
                    "quantity": "5",
                    "barcode": "fresh-lemon-001",
                    "description": "Tangy lemons",
                },
                format="multipart",
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "Product image upload is temporarily unavailable.")


@override_settings(ALLOWED_HOSTS=["testserver", "127.0.0.1", "localhost"])
class CustomerOrderApiTests(APITestCase):
    def setUp(self):
        self.category = Category.objects.create(name="Snacks")
        self.customer_user = User.objects.create_user(
            username="customer-test",
            email="customer-test@example.com",
            password="pass12345",
            full_name="Customer Test",
            phone="255700000010",
            address="Town",
            role="customer",
        )
        self.customer = Customer.objects.create(user=self.customer_user, phone=self.customer_user.phone)
        self.supplier_user = User.objects.create_user(
            username="supplier-order-test",
            email="supplier-order-test@example.com",
            password="pass12345",
            full_name="Supplier Order Test",
            phone="255700000011",
            role="supplier",
        )
        self.driver_user = User.objects.create_user(
            username="driver-order-test",
            email="driver-order-test@example.com",
            password="pass12345",
            full_name="Driver Order Test",
            phone="255700000013",
            role="driver",
        )
        self.supplier = Supplier.objects.create(
            user=self.supplier_user,
            company_name="Supplier Order Test Co",
            phone=self.supplier_user.phone,
            address="Stone Town",
        )
        self.product = Product.objects.create(
            name="Biscuits",
            slug="biscuits",
            category=self.category,
            supplier=self.supplier,
            price="3200.00",
            cost_price="2200.00",
            quantity=15,
            barcode="biscuits-001",
            description="Crunchy biscuits",
        )

    def test_checkout_stores_customer_snapshot_and_returns_whatsapp_url(self):
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.post(
            "/api/customer/checkout/",
            {
                "items": [{"product": self.product.id, "quantity": 2}],
                "payment_method": "mobile_money",
                "customer_full_name": "Asha Mwinyi",
                "customer_email": "asha@example.com",
                "customer_phone": "+255711252700",
                "customer_address": "Mjini, Zanzibar",
                "delivery_location": "Forodhani Garden",
                "terms_accepted": True,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("https://wa.me/255711252758", response.data["whatsapp_url"])
        sale = Sale.objects.get(id=response.data["sale"]["id"])
        self.assertEqual(sale.customer_full_name, "Asha Mwinyi")
        self.assertEqual(sale.customer_email, "asha@example.com")
        self.assertEqual(sale.customer_phone, "+255711252700")
        self.assertEqual(sale.customer_address, "Mjini, Zanzibar")
        self.assertEqual(response.data["sale"]["payment_status"], "pending")

    def test_checkout_returns_503_when_database_write_fails(self):
        self.client.force_authenticate(user=self.customer_user)

        with patch("supermarketzanzibar.views.Sale.objects.create", side_effect=DatabaseError("db down")):
            response = self.client.post(
                "/api/customer/checkout/",
                {
                    "items": [{"product": self.product.id, "quantity": 1}],
                    "payment_method": "mobile_money",
                    "customer_full_name": "Asha Mwinyi",
                    "customer_email": "asha@example.com",
                    "customer_phone": "+255711252700",
                    "customer_address": "Mjini, Zanzibar",
                    "delivery_location": "Forodhani Garden",
                    "terms_accepted": True,
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(response.data["detail"], "Unable to place this order right now. Please try again shortly.")

    def test_checkout_succeeds_when_barcode_image_generation_fails(self):
        self.client.force_authenticate(user=self.customer_user)

        broken_drawing = type("BrokenDrawing", (), {"asString": lambda self, format_name: (_ for _ in ()).throw(RuntimeError("png backend missing"))})()

        with patch("supermarketzanzibar.serializers.createBarcodeDrawing", return_value=broken_drawing):
            response = self.client.post(
                "/api/customer/checkout/",
                {
                    "items": [{"product": self.product.id, "quantity": 1}],
                    "payment_method": "mobile_money",
                    "customer_full_name": "Asha Mwinyi",
                    "customer_email": "asha@example.com",
                    "customer_phone": "+255711252700",
                    "customer_address": "Mjini, Zanzibar",
                    "delivery_location": "Forodhani Garden",
                    "terms_accepted": True,
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("payment", response.data)
        self.assertIsNone(response.data["payment"]["barcode_image_url"])

    def test_customer_can_download_pdf_receipt_after_payment_confirmation(self):
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("6400.00"),
            final_amount=Decimal("6400.00"),
            payment_method="mobile_money",
            payment_confirmed=True,
            delivery_location="Stone Town",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="payment_confirmed",
        )
        Payment.objects.create(
            sale=sale,
            payment_method="mobile_money",
            status="confirmed",
        )
        sale.items.create(product=self.product, quantity=2, price=Decimal("3200.00"), total=Decimal("6400.00"))
        self.client.force_authenticate(user=self.customer_user)

        response = self.client.get(f"/api/customer/orders/{sale.id}/receipt/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
        self.assertGreater(len(response.content), 5000)
        self.assertIn(b"OFFICIAL CUSTOMER RECEIPT", response.content)
        self.assertIn(b"Payment Confirmed", response.content)
        self.assertIn(b"PAID PRODUCTS", response.content)
        self.assertIn(b"ABOUT US", response.content)
        self.assertIn(b"CONTACT US", response.content)

    def test_supplier_dashboard_includes_pending_payments_for_own_products(self):
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=False,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="pending_payment",
        )
        sale.items.create(product=self.product, quantity=1, price=Decimal("3200.00"), total=Decimal("3200.00"))
        Payment.objects.create(sale=sale, payment_method="mobile_money", status="pending")
        self.client.force_authenticate(user=self.supplier_user)

        response = self.client.get("/api/supplier/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pending_payments_count"], 1)
        self.assertEqual(response.data["pending_payments"][0]["sale_id"], sale.id)
        self.assertEqual(response.data["pending_payments"][0]["items"][0]["product_name"], "Biscuits")

    def test_supplier_alerts_endpoint_returns_pending_order_notifications(self):
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=False,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="pending_payment",
        )
        sale.items.create(product=self.product, quantity=1, price=Decimal("3200.00"), total=Decimal("3200.00"))
        payment = Payment.objects.create(sale=sale, payment_method="mobile_money", status="pending")
        self.client.force_authenticate(user=self.supplier_user)

        response = self.client.get("/api/supplier/alerts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["pending_count"], 1)
        self.assertEqual(response.data["alerts"][0]["id"], payment.id)
        self.assertEqual(response.data["alerts"][0]["sale_id"], sale.id)
        self.assertEqual(response.data["alerts"][0]["type"], "supplier_order")

    def test_driver_alerts_endpoint_returns_active_delivery_notifications(self):
        active_sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=True,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            assigned_driver=self.driver_user,
            status="out_for_delivery",
        )
        delivered_sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=True,
            delivery_location="Mtoni",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            assigned_driver=self.driver_user,
            status="delivered",
        )
        self.client.force_authenticate(user=self.driver_user)

        response = self.client.get("/api/driver/alerts/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["active_count"], 1)
        self.assertEqual(response.data["alerts"][0]["sale_id"], active_sale.id)
        self.assertEqual(response.data["alerts"][0]["type"], "driver_delivery")
        self.assertNotEqual(response.data["alerts"][0]["sale_id"], delivered_sale.id)

    def test_driver_dashboard_auto_assigns_ready_sales_when_only_one_driver_exists(self):
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=True,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="payment_confirmed",
        )
        self.client.force_authenticate(user=self.driver_user)

        response = self.client.get("/api/driver/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        sale.refresh_from_db()
        self.assertEqual(sale.assigned_driver, self.driver_user)
        self.assertEqual(sale.status, "out_for_delivery")
        self.assertEqual(response.data["active_deliveries"][0]["id"], sale.id)

    def test_supplier_can_confirm_pending_payment_for_own_product(self):
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=False,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="pending_payment",
        )
        sale.items.create(product=self.product, quantity=1, price=Decimal("3200.00"), total=Decimal("3200.00"))
        payment = Payment.objects.create(sale=sale, payment_method="mobile_money", status="pending")
        self.client.force_authenticate(user=self.supplier_user)

        response = self.client.post(f"/api/payments/{payment.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment.refresh_from_db()
        sale.refresh_from_db()
        self.assertEqual(payment.status, "confirmed")
        self.assertEqual(payment.confirmed_by, self.supplier_user)
        self.assertTrue(sale.payment_confirmed)
        self.assertEqual(sale.status, "out_for_delivery")
        self.assertEqual(sale.assigned_driver, self.driver_user)

    def test_supplier_cannot_confirm_pending_payment_for_other_supplier_product(self):
        other_supplier_user = User.objects.create_user(
            username="other-supplier",
            email="other-supplier@example.com",
            password="pass12345",
            full_name="Other Supplier",
            phone="255700000012",
            role="supplier",
        )
        other_supplier = Supplier.objects.create(
            user=other_supplier_user,
            company_name="Other Supplier Co",
            phone=other_supplier_user.phone,
            address="Paje",
        )
        other_product = Product.objects.create(
            name="Juice",
            slug="juice",
            category=self.category,
            supplier=other_supplier,
            price="2500.00",
            cost_price="1700.00",
            quantity=8,
            barcode="juice-001",
            description="Fresh juice",
        )
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("2500.00"),
            final_amount=Decimal("2500.00"),
            payment_method="mobile_money",
            payment_confirmed=False,
            delivery_location="Kiembe Samaki",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="pending_payment",
        )
        sale.items.create(product=other_product, quantity=1, price=Decimal("2500.00"), total=Decimal("2500.00"))
        payment = Payment.objects.create(sale=sale, payment_method="mobile_money", status="pending")
        self.client.force_authenticate(user=self.supplier_user)

        response = self.client.post(f"/api/payments/{payment.id}/confirm/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payment.refresh_from_db()
        self.assertEqual(payment.status, "pending")

    def test_admin_pending_payments_include_customer_order_details(self):
        admin_user = User.objects.create_user(
            username="admin-test",
            email="admin-test@example.com",
            password="pass12345",
            full_name="Admin Test",
            phone="255700000099",
            role="admin",
        )
        sale = Sale.objects.create(
            customer=self.customer,
            user=self.customer_user,
            total_amount=Decimal("3200.00"),
            final_amount=Decimal("3200.00"),
            payment_method="mobile_money",
            payment_confirmed=False,
            delivery_location="Darajani",
            terms_accepted=True,
            customer_full_name="Customer Test",
            customer_email="customer-test@example.com",
            customer_phone="255700000010",
            customer_address="Town",
            status="pending_payment",
        )
        sale.items.create(product=self.product, quantity=1, price=Decimal("3200.00"), total=Decimal("3200.00"))
        Payment.objects.create(sale=sale, payment_method="mobile_money", status="pending")
        self.client.force_authenticate(user=admin_user)

        response = self.client.get("/api/payments/admin_pending/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["customer_phone"], "255700000010")
        self.assertEqual(response.data[0]["delivery_location"], "Darajani")
        self.assertEqual(response.data[0]["items"][0]["product_name"], "Biscuits")
