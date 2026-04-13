from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import *

router = DefaultRouter()

router.register('users', UserViewSet)
router.register('categories', CategoryViewSet)
router.register('suppliers', SupplierViewSet)
router.register('customers', CustomerViewSet)
router.register('products', ProductViewSet)
router.register('sales', SaleViewSet)
router.register('sale-items', SaleItemViewSet)
router.register('stock', StockViewSet)
router.register('payments', PaymentViewSet)

urlpatterns = [
    path('auth/login/', CustomerLoginView.as_view(), name='customer_login'),
    path('auth/google/', CustomerGoogleLoginView.as_view(), name='customer_google_login'),
    path('auth/admin/login/', AdminLoginView.as_view(), name='admin_login'),
    path('auth/supplier/login/', SupplierLoginView.as_view(), name='supplier_login'),
    path('auth/driver/login/', DriverLoginView.as_view(), name='driver_login'),
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/admin/register/', AdminRegisterView.as_view(), name='auth_admin_register'),
    path('auth/me/', MeView.as_view(), name='auth_me'),
    path('auth/admin/create-user/', AdminCreateUserView.as_view(), name='auth_admin_create_user'),
    path('auth/schedule-task/', ScheduledAccessListView.as_view(), name='schedule_task_list'),
    path('auth/schedule-task/<int:user_id>/', ScheduledAccessDetailView.as_view(), name='schedule_task_detail'),
    path('auth/token/refresh/', SafeTokenRefreshView.as_view(), name='token_refresh'),
    path('customer/checkout/', CheckoutView.as_view(), name='customer_checkout'),
    path('customer/orders/', CustomerOrdersView.as_view(), name='customer_orders'),
    path('customer/orders/<int:sale_id>/', CustomerOrderHistoryItemView.as_view(), name='customer_order_history_item'),
    path('customer/orders/<int:sale_id>/receipt/', CustomerReceiptView.as_view(), name='customer_order_receipt'),
    path('supplier/dashboard/', SupplierDashboardView.as_view(), name='supplier_dashboard'),
    path('supplier/alerts/', SupplierAlertsView.as_view(), name='supplier_alerts'),
    path('driver/dashboard/', DriverDashboardView.as_view(), name='driver_dashboard'),
    path('driver/alerts/', DriverAlertsView.as_view(), name='driver_alerts'),
    path('driver/sales/<int:sale_id>/status/', DriverUpdateDeliveryView.as_view(), name='driver_sale_status'),
    path('', include(router.urls)),
]
