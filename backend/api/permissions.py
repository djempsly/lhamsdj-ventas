from rest_framework.permissions import BasePermission


# =============================================================================
# BASE PERMISSIONS
# =============================================================================

class IsNegocioMember(BasePermission):
    """Verifies the object belongs to the user's business."""

    def has_object_permission(self, request, view, obj):
        if request.user.rol == 'SUPER_ADMIN':
            return True
        obj_negocio = getattr(obj, 'negocio_id', None) or getattr(obj, 'negocio', None)
        return str(obj_negocio) == str(request.user.negocio_id)


class ReadOnly(BasePermission):
    """Allow read-only access for any authenticated user."""

    def has_permission(self, request, view):
        return request.method in ('GET', 'HEAD', 'OPTIONS')


# =============================================================================
# ROLE-BASED PERMISSIONS
# =============================================================================

ADMIN_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO')
MANAGEMENT_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'GERENTE')
ACCOUNTING_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'GERENTE')
SALES_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'GERENTE', 'VENDEDOR', 'CAJERO')


class IsAdminRole(BasePermission):
    """Only SUPER_ADMIN and ADMIN_NEGOCIO."""

    def has_permission(self, request, view):
        return request.user.rol in ADMIN_ROLES


class IsManagementRole(BasePermission):
    """SUPER_ADMIN, ADMIN_NEGOCIO, GERENTE."""

    def has_permission(self, request, view):
        return request.user.rol in MANAGEMENT_ROLES


class IsAccountingRole(BasePermission):
    """SUPER_ADMIN, ADMIN_NEGOCIO, CONTADOR, GERENTE."""

    def has_permission(self, request, view):
        return request.user.rol in ACCOUNTING_ROLES


class IsSalesRole(BasePermission):
    """Any role that can make sales."""

    def has_permission(self, request, view):
        return request.user.rol in SALES_ROLES


# =============================================================================
# FEATURE PERMISSIONS
# =============================================================================

class CanEmitECF(BasePermission):
    """Only authorized roles can emit electronic invoices."""

    def has_permission(self, request, view):
        return request.user.rol in ACCOUNTING_ROLES


class CanViewReports(BasePermission):
    """Only authorized roles can view fiscal reports."""

    def has_permission(self, request, view):
        if request.user.rol in ACCOUNTING_ROLES:
            return True
        return request.user.puede_ver_reportes


class CanExportData(BasePermission):
    """Only authorized roles can export data."""

    def has_permission(self, request, view):
        if request.user.rol in ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR'):
            return True
        return request.user.puede_exportar_datos


class CanManageProducts(BasePermission):
    """Checks product creation/edit permissions."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        if request.user.rol in MANAGEMENT_ROLES:
            return True
        return request.user.puede_crear_productos


class CanManageUsers(BasePermission):
    """Only admins can manage users."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return request.user.rol in ADMIN_ROLES


class CanManageAccounting(BasePermission):
    """Accounting operations: read for managers, write for accountants."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return request.user.rol in (*ACCOUNTING_ROLES, 'VENDEDOR')
        return request.user.rol in ACCOUNTING_ROLES


class CanManageHR(BasePermission):
    """HR operations: only admins and managers."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return request.user.rol in MANAGEMENT_ROLES
        return request.user.rol in ADMIN_ROLES


class CanManagePurchases(BasePermission):
    """Purchase management permissions."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return request.user.rol in (*MANAGEMENT_ROLES, 'ALMACEN')
        return request.user.rol in MANAGEMENT_ROLES


class CanManageBanking(BasePermission):
    """Banking/reconciliation permissions."""

    def has_permission(self, request, view):
        return request.user.rol in ACCOUNTING_ROLES


class CanApprovePurchaseOrders(BasePermission):
    """Only managers and admins can approve purchase orders."""

    def has_permission(self, request, view):
        return request.user.rol in MANAGEMENT_ROLES


class CanManageCRM(BasePermission):
    """CRM access for sales and management."""

    def has_permission(self, request, view):
        return request.user.rol in (*MANAGEMENT_ROLES, 'VENDEDOR')
