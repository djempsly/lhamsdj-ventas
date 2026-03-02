from rest_framework.permissions import BasePermission


class IsNegocioMember(BasePermission):
    """Verifies the object belongs to the user's business."""

    def has_object_permission(self, request, view, obj):
        if request.user.rol == 'SUPER_ADMIN':
            return True
        obj_negocio = getattr(obj, 'negocio_id', None) or getattr(obj, 'negocio', None)
        return str(obj_negocio) == str(request.user.negocio_id)


class CanEmitECF(BasePermission):
    """Only authorized roles can emit electronic invoices."""

    def has_permission(self, request, view):
        return request.user.rol in [
            'SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'GERENTE',
        ]


class CanViewReports(BasePermission):
    """Only authorized roles can view fiscal reports."""

    def has_permission(self, request, view):
        if request.user.rol in ['SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'GERENTE']:
            return True
        return request.user.puede_ver_reportes


class CanExportData(BasePermission):
    """Only authorized roles can export data."""

    def has_permission(self, request, view):
        if request.user.rol in ['SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR']:
            return True
        return request.user.puede_exportar_datos


class CanManageProducts(BasePermission):
    """Checks product creation/edit permissions."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        if request.user.rol in ['SUPER_ADMIN', 'ADMIN_NEGOCIO', 'GERENTE']:
            return True
        return request.user.puede_crear_productos


class CanManageUsers(BasePermission):
    """Only admins can manage users."""

    def has_permission(self, request, view):
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return request.user.rol in ['SUPER_ADMIN', 'ADMIN_NEGOCIO']
