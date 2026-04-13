from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import (
    CustomUser,
    Category,
    Supplier,
    Customer,
    Product,
    Sale,
    SaleItem,
    StockMovement,
)


# ==========================
# Custom User Admin
# ==========================

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):

    list_display = (
        'id',
        'username',
        'full_name',
        'email',
        'phone',
        'role',
        'is_staff',
        'is_active',
    )

    search_fields = (
        'username',
        'full_name',
        'email',
        'phone',
    )

    list_filter = (
        'role',
        'is_staff',
        'is_active',
    )

    fieldsets = UserAdmin.fieldsets + (
        ('Additional Info', {
            'fields': (
                'full_name',
                'phone',
                'address',
                'role',
            )
        }),
    )


# ==========================
# Category Admin
# ==========================

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):

    list_display = ('id', 'name', 'created_at')

    search_fields = ('name',)


# ==========================
# Supplier Admin
# ==========================

@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'company_name',
        'phone',
        'user',
    )

    search_fields = (
        'company_name',
        'phone',
    )


# ==========================
# Customer Admin
# ==========================

@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'user',
        'phone',
        'loyalty_points',
    )

    search_fields = (
        'user__full_name',
        'phone',
    )


# ==========================
# Product Admin
# ==========================

@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'name',
        'category',
        'supplier',
        'price',
        'quantity',
        'barcode',
        'is_active',
        'created_at',
    )

    search_fields = (
        'name',
        'barcode',
    )

    list_filter = (
        'category',
        'supplier',
        'is_active',
    )


# ==========================
# Sale Item Inline
# ==========================

class SaleItemInline(admin.TabularInline):

    model = SaleItem

    extra = 0


# ==========================
# Sale Admin
# ==========================

@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'customer',
        'user',
        'total_amount',
        'discount',
        'tax',
        'final_amount',
        'payment_method',
        'date',
    )

    list_filter = (
        'payment_method',
        'date',
    )

    inlines = [SaleItemInline]


# ==========================
# Sale Item Admin
# ==========================

@admin.register(SaleItem)
class SaleItemAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'sale',
        'product',
        'quantity',
        'price',
        'total',
    )


# ==========================
# Stock Movement Admin
# ==========================

@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):

    list_display = (
        'id',
        'product',
        'movement_type',
        'quantity',
        'date',
    )

    list_filter = (
        'movement_type',
        'date',
    )
