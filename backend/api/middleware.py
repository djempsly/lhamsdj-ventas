import logging
import json
import time
from django.utils.deprecation import MiddlewareMixin
from django.http import JsonResponse
from django.utils import timezone

logger = logging.getLogger('audit')
security_logger = logging.getLogger('security')


class IPBlacklistMiddleware(MiddlewareMixin):
    """Block requests from blacklisted IPs."""

    def process_request(self, request):
        if not request.path.startswith('/api/'):
            return None

        ip = self._get_client_ip(request)
        if not ip:
            return None

        from api.models import IPBloqueada
        try:
            blocked = IPBloqueada.objects.get(ip_address=ip)
            if blocked.esta_bloqueada:
                security_logger.warning('Blocked IP %s attempted access: %s', ip, request.path)
                return JsonResponse(
                    {'detail': 'Acceso denegado.'},
                    status=403
                )
        except IPBloqueada.DoesNotExist:
            pass

        return None

    def _get_client_ip(self, request):
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR', '')


class NegocioFilterMiddleware(MiddlewareMixin):
    """Attach negocio to request for multi-tenant filtering."""

    def process_request(self, request):
        if hasattr(request, 'user') and request.user.is_authenticated:
            request.negocio = getattr(request.user, 'negocio', None)
        else:
            request.negocio = None


class SecurityHeadersMiddleware(MiddlewareMixin):
    """Add extra security headers to all responses."""

    def process_response(self, request, response):
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        response['X-XSS-Protection'] = '1; mode=block'
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response['Permissions-Policy'] = (
            'camera=(), microphone=(), geolocation=(), payment=()'
        )
        # Cache control for API responses
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
            response['Pragma'] = 'no-cache'
        return response


class AuditMiddleware(MiddlewareMixin):
    """Automatically log all mutating API requests to AuditLog."""

    AUDIT_METHODS = ('POST', 'PUT', 'PATCH', 'DELETE')

    def process_request(self, request):
        request._audit_start_time = time.time()

    def process_response(self, request, response):
        if request.method not in self.AUDIT_METHODS:
            return response
        if not hasattr(request, 'user') or not request.user.is_authenticated:
            return response
        if not request.path.startswith('/api/'):
            return response
        # Skip auth endpoints (logged separately in views)
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

            resultado = 'SUCCESS' if response.status_code < 400 else 'FAILED'

            ip = request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            if not ip:
                ip = request.META.get('REMOTE_ADDR', '')

            # Calculate duration
            duracion_ms = None
            start_time = getattr(request, '_audit_start_time', None)
            if start_time:
                duracion_ms = int((time.time() - start_time) * 1000)

            AuditLog.objects.create(
                negocio=negocio,
                usuario=request.user,
                accion=action_map.get(request.method, 'UPDATE'),
                modelo=modelo,
                objeto_id=objeto_id[:100],
                descripcion=description[:500],
                ip_address=ip or None,
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                duracion_ms=duracion_ms,
                resultado=resultado,
            )
        except Exception:
            logger.exception('Error in audit middleware')

        return response
