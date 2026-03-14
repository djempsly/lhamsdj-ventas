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
AUDIT_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'AUDITOR')
INVENTORY_ROLES = ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'GERENTE', 'ALMACEN', 'INVENTARIO')


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


class IsAuditRole(BasePermission):
    """SUPER_ADMIN, ADMIN_NEGOCIO, AUDITOR - read-only audit access."""

    def has_permission(self, request, view):
        if request.user.rol in AUDIT_ROLES:
            return True
        return False


class IsInventoryRole(BasePermission):
    """Roles that manage inventory."""

    def has_permission(self, request, view):
        return request.user.rol in INVENTORY_ROLES


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
        if request.user.rol in (*ACCOUNTING_ROLES, 'AUDITOR'):
            return True
        return request.user.puede_ver_reportes


class CanExportData(BasePermission):
    """Only authorized roles can export data."""

    def has_permission(self, request, view):
        if request.user.rol in ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'AUDITOR'):
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
            return request.user.rol in (*ACCOUNTING_ROLES, 'VENDEDOR', 'AUDITOR')
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
            return request.user.rol in (*MANAGEMENT_ROLES, 'ALMACEN', 'INVENTARIO')
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


class CanMakeDiscounts(BasePermission):
    """Validates discount capability."""

    def has_permission(self, request, view):
        if request.user.rol == 'SUPER_ADMIN':
            return True
        if request.user.puede_hacer_descuentos:
            return True
        return request.user.rol in ('ADMIN_NEGOCIO', 'GERENTE', 'CAJERO', 'VENDEDOR')


class CanVoidSales(BasePermission):
    """Only authorized users can void/cancel sales."""

    def has_permission(self, request, view):
        if request.user.rol in MANAGEMENT_ROLES:
            return True
        return request.user.puede_anular_ventas


class CanManageApiKeys(BasePermission):
    """Only admins can manage API keys."""

    def has_permission(self, request, view):
        return request.user.rol in ADMIN_ROLES


class CanViewAuditLogs(BasePermission):
    """Audit log access for admins and auditors."""

    def has_permission(self, request, view):
        return request.user.rol in AUDIT_ROLES


class CanManageSecurity(BasePermission):
    """Security management (alerts, IP blocks, sessions)."""

    def has_permission(self, request, view):
        return request.user.rol in ADMIN_ROLES


# =============================================================================
# SEPARATION OF DUTIES
# =============================================================================

class RequiresDifferentApprover(BasePermission):
    """
    Ensures the person approving is different from who requested.
    Used for high-value transactions, discounts, voids.
    """

    def has_object_permission(self, request, view, obj):
        # The person confirming must be different from the requestor
        solicitado_por = getattr(obj, 'solicitado_por_id', None)
        if solicitado_por and str(solicitado_por) == str(request.user.id):
            return False
        return True


# =============================================================================
# API KEY SCOPE PERMISSIONS
# =============================================================================

class HasApiKeyScope(BasePermission):
    """Check API key has required scope for the endpoint."""

    def has_permission(self, request, view):
        # If not using API key auth, allow (other permissions will check)
        if not hasattr(request, 'api_key_scopes'):
            return True

        scopes = request.api_key_scopes
        # Derive required scope from view
        resource = getattr(view, 'api_key_resource', '')
        if not resource:
            return False

        method_map = {
            'GET': 'read',
            'HEAD': 'read',
            'OPTIONS': 'read',
            'POST': 'write',
            'PUT': 'write',
            'PATCH': 'write',
            'DELETE': 'delete',
        }
        action = method_map.get(request.method, 'read')
        required_scope = f'{resource}:{action}'

        return required_scope in scopes or f'{resource}:*' in scopes
