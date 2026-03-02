import logging
import json
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger('audit')


class AuditMiddleware(MiddlewareMixin):
    """Automatically log all mutating API requests to AuditLog."""

    AUDIT_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')

    def process_response(self, request, response):
        if request.method not in self.AUDIT_METHODS:
            return response
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return response
        if not request.path.startswith('/api/'):
            return response
        # Skip auth endpoints
        if any(request.path.startswith(p) for p in ('/api/auth/', '/api/token/')):
            return response

        try:
            from .models import AuditLog
            negocio = getattr(request.user, 'negocio', None)
            if not negocio:
                return response

            action_map = {
                'POST': 'CREATE',
                'PUT': 'UPDATE',
                'PATCH': 'UPDATE',
                'DELETE': 'DELETE',
            }

            # Extract model name from URL path
            parts = [p for p in request.path.split('/') if p and p != 'api']
            modelo = parts[0].replace('-', '_').title() if parts else 'Unknown'

            # Get object ID from URL if present
            objeto_id = ''
            if len(parts) > 1 and parts[1] not in ('dashboard', 'export', 'preview'):
                objeto_id = parts[1]

            description = f'{request.method} {request.path}'
            if response.status_code >= 400:
                description += f' [ERROR {response.status_code}]'

            # Only log successful mutations
            if response.status_code < 400:
                ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
                if not ip:
                    ip = request.META.get('REMOTE_ADDR', '')

                AuditLog.objects.create(
                    negocio=negocio,
                    usuario=request.user,
                    accion=action_map.get(request.method, 'UPDATE'),
                    modelo=modelo,
                    objeto_id=objeto_id[:100],
                    descripcion=description[:500],
                    ip_address=ip or None,
                    user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                )
        except Exception:
            logger.exception('Error in audit middleware')

        return response


class NegocioFilterMiddleware(MiddlewareMixin):
    """Attach negocio to request for multi-tenant filtering."""

    def process_request(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            request.negocio = getattr(request.user, 'negocio', None)
        else:
            request.negocio = None
