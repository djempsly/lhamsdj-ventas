import logging
import uuid
import os
from datetime import timedelta

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.db import transaction
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from django.http import HttpResponse

from .models import (
    Pais, Moneda, Negocio, Sucursal, Usuario, AuditLog,
    CuentaContable, Categoria, Producto, Almacen,
    Cliente, Proveedor, Venta, DetalleVenta, CuadreCaja, AnalisisAI,
    FacturaElectronica,
)
from .serializers import (
    PaisSerializer, MonedaSerializer, NegocioSerializer, SucursalSerializer,
    UsuarioSerializer, CuentaContableSerializer, CategoriaSerializer,
    ProductoSerializer, ClienteSerializer, ProveedorSerializer,
    VentaSerializer, DetalleVentaSerializer, CuadreCajaSerializer,
    AnalisisAISerializer,
)
from .permissions import (
    IsNegocioMember, CanEmitECF, CanViewReports,
    CanExportData, CanManageProducts, CanManageUsers,
)
from .utils.ecf_generator import ECFGenerator
from .utils.xml_signer import sign_ecf_xml
from .fiscal.strategies.dgii import FiscalStrategyFactory

logger = logging.getLogger('security')


# =============================================================================
# HELPERS
# =============================================================================

def _get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')


def _set_auth_cookies(response, access_token, refresh_token):
    """Set httpOnly cookies for JWT tokens."""
    response.set_cookie(
        'access_token',
        str(access_token),
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite='Lax',
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        domain=settings.COOKIE_DOMAIN,
        path='/',
    )
    response.set_cookie(
        'refresh_token',
        str(refresh_token),
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite='Lax',
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        domain=settings.COOKIE_DOMAIN,
        path='/api/auth/',
    )
    return response


def _clear_auth_cookies(response):
    """Remove auth cookies."""
    response.delete_cookie('access_token', path='/', domain=settings.COOKIE_DOMAIN)
    response.delete_cookie('refresh_token', path='/api/auth/', domain=settings.COOKIE_DOMAIN)
    return response


# =============================================================================
# AUTHENTICATION
# =============================================================================

class LoginThrottle(AnonRateThrottle):
    rate = '10/minute'


class CustomLoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        user = self.user
        user.ultimo_acceso = timezone.now()
        user.save(update_fields=['ultimo_acceso'])

        data['usuario'] = {
            'id': str(user.id),
            'username': user.username,
            'email': user.email,
            'nombre': user.get_full_name() or user.username,
            'rol': user.rol,
            'permisos': {
                'puede_crear_productos': user.puede_crear_productos,
                'puede_editar_precios': user.puede_editar_precios,
                'puede_ver_costos': user.puede_ver_costos,
                'puede_hacer_descuentos': user.puede_hacer_descuentos,
                'puede_anular_ventas': user.puede_anular_ventas,
                'puede_ver_reportes': user.puede_ver_reportes,
            },
        }
        if user.negocio:
            data['negocio'] = {
                'id': str(user.negocio.id),
                'nombre': user.negocio.nombre_comercial,
                'pais': user.negocio.pais_id if user.negocio.pais_id else 'DOM',
            }
        return data


class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomLoginSerializer
    throttle_classes = [LoginThrottle]

    def post(self, request, *args, **kwargs):
        username = request.data.get('username', '')

        # --- Brute-force protection ---
        try:
            user = Usuario.objects.get(username=username)
            if user.cuenta_bloqueada_hasta and user.cuenta_bloqueada_hasta > timezone.now():
                remaining = max(1, (user.cuenta_bloqueada_hasta - timezone.now()).seconds // 60)
                logger.warning('Blocked login attempt for locked account: %s', username)
                return Response(
                    {'detail': f'Cuenta bloqueada. Intenta en {remaining} minutos.'},
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )
        except Usuario.DoesNotExist:
            pass

        try:
            response = super().post(request, *args, **kwargs)
        except Exception:
            # --- Record failed attempt ---
            try:
                user = Usuario.objects.get(username=username)
                user.intentos_fallidos += 1
                update_fields = ['intentos_fallidos']
                if user.intentos_fallidos >= 5:
                    user.cuenta_bloqueada_hasta = timezone.now() + timedelta(minutes=15)
                    update_fields.append('cuenta_bloqueada_hasta')
                    logger.warning('Account locked after %d failed attempts: %s', user.intentos_fallidos, username)
                user.save(update_fields=update_fields)

                if user.negocio:
                    AuditLog.objects.create(
                        negocio=user.negocio,
                        usuario=user,
                        accion='LOGIN_FALLIDO',
                        modelo='Usuario',
                        objeto_id=str(user.id),
                        descripcion=f'Login fallido (intento {user.intentos_fallidos})',
                        ip_address=_get_client_ip(request),
                        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                    )
            except Usuario.DoesNotExist:
                pass

            return Response(
                {'detail': 'Credenciales invalidas'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if response.status_code == 200:
            # Reset failed attempts on success
            try:
                user = Usuario.objects.get(username=username)
                user.intentos_fallidos = 0
                user.cuenta_bloqueada_hasta = None
                user.save(update_fields=['intentos_fallidos', 'cuenta_bloqueada_hasta'])

                if user.negocio:
                    AuditLog.objects.create(
                        negocio=user.negocio,
                        usuario=user,
                        accion='LOGIN',
                        modelo='Usuario',
                        objeto_id=str(user.id),
                        descripcion=f'Login exitoso desde {_get_client_ip(request)}',
                        ip_address=_get_client_ip(request),
                        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                    )
            except Usuario.DoesNotExist:
                pass

            # Set httpOnly cookies
            access_token = response.data.get('access')
            refresh_token = response.data.get('refresh')
            _set_auth_cookies(response, access_token, refresh_token)

            # Remove raw tokens from response body
            response.data.pop('access', None)
            response.data.pop('refresh', None)

        return response


class CookieTokenRefreshView(APIView):
    """Refresh access token using the httpOnly refresh cookie."""
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        raw_refresh = request.COOKIES.get('refresh_token')
        if not raw_refresh:
            return Response({'detail': 'No refresh token'}, status=401)

        try:
            token = RefreshToken(raw_refresh)
            new_access = str(token.access_token)

            response = Response({'detail': 'Token refreshed'})
            response.set_cookie(
                'access_token',
                new_access,
                httponly=True,
                secure=settings.COOKIE_SECURE,
                samesite='Lax',
                max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
                domain=settings.COOKIE_DOMAIN,
                path='/',
            )

            # Rotate refresh token
            if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS'):
                new_refresh = str(token)
                response.set_cookie(
                    'refresh_token',
                    new_refresh,
                    httponly=True,
                    secure=settings.COOKIE_SECURE,
                    samesite='Lax',
                    max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
                    domain=settings.COOKIE_DOMAIN,
                    path='/api/auth/',
                )
                if settings.SIMPLE_JWT.get('BLACKLIST_AFTER_ROTATION'):
                    try:
                        token.blacklist()
                    except AttributeError:
                        pass

            return response
        except Exception:
            response = Response({'detail': 'Token invalido'}, status=401)
            _clear_auth_cookies(response)
            return response


class LogoutView(APIView):
    """Blacklist the refresh token and clear auth cookies."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            raw_refresh = request.COOKIES.get('refresh_token')
            if raw_refresh:
                token = RefreshToken(raw_refresh)
                token.blacklist()
        except Exception:
            pass

        if request.user.negocio:
            AuditLog.objects.create(
                negocio=request.user.negocio,
                usuario=request.user,
                accion='LOGOUT',
                modelo='Usuario',
                objeto_id=str(request.user.id),
                descripcion='Cierre de sesion',
                ip_address=_get_client_ip(request),
            )

        response = Response({'detail': 'Sesion cerrada'})
        _clear_auth_cookies(response)
        return response


# =============================================================================
# READ-ONLY VIEWSETS
# =============================================================================

class PaisViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Pais.objects.filter(activo=True)
    serializer_class = PaisSerializer
    permission_classes = [IsAuthenticated]


class MonedaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Moneda.objects.all()
    serializer_class = MonedaSerializer
    permission_classes = [IsAuthenticated]


# =============================================================================
# BUSINESS & USER VIEWSETS (with multi-tenancy)
# =============================================================================

class NegocioViewSet(viewsets.ModelViewSet):
    serializer_class = NegocioSerializer
    permission_classes = [IsAuthenticated, IsNegocioMember]

    def get_queryset(self):
        user = self.request.user
        if user.rol == 'SUPER_ADMIN':
            return Negocio.objects.all()
        return Negocio.objects.filter(id=user.negocio_id)

    def perform_update(self, serializer):
        if self.request.user.rol not in ('SUPER_ADMIN', 'ADMIN_NEGOCIO'):
            raise PermissionDenied('No tiene permisos para modificar el negocio.')
        serializer.save()


class SucursalViewSet(viewsets.ModelViewSet):
    serializer_class = SucursalSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Sucursal.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class UsuarioViewSet(viewsets.ModelViewSet):
    serializer_class = UsuarioSerializer
    permission_classes = [IsAuthenticated, CanManageUsers]

    def get_queryset(self):
        user = self.request.user
        if user.rol == 'SUPER_ADMIN':
            return Usuario.objects.all()
        return Usuario.objects.filter(negocio=user.negocio)

    def perform_create(self, serializer):
        if self.request.user.rol != 'SUPER_ADMIN':
            serializer.save(negocio=self.request.user.negocio)
        else:
            serializer.save()


# =============================================================================
# ACCOUNTING
# =============================================================================

class CuentaContableViewSet(viewsets.ModelViewSet):
    serializer_class = CuentaContableSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CuentaContable.objects.filter(
            negocio=self.request.user.negocio,
            cuenta_padre__isnull=True,
        ).prefetch_related('subcuentas__subcuentas')

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


# =============================================================================
# PRODUCTS & INVENTORY
# =============================================================================

class CategoriaViewSet(viewsets.ModelViewSet):
    serializer_class = CategoriaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Categoria.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class ProductoViewSet(viewsets.ModelViewSet):
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated, CanManageProducts]

    def get_queryset(self):
        return Producto.objects.filter(negocio=self.request.user.negocio, activo=True)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)

    @action(detail=False, methods=['get'])
    def buscar(self, request):
        q = request.query_params.get('q', '').strip()[:100]
        if len(q) < 1:
            return Response([])
        productos = self.get_queryset().filter(
            Q(codigo_barras__icontains=q) | Q(nombre__icontains=q)
        )[:10]
        serializer = self.get_serializer(productos, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def stock_bajo(self, request):
        productos = self.get_queryset().filter(stock_actual__lte=F('stock_minimo'))
        serializer = self.get_serializer(productos, many=True)
        return Response(serializer.data)


# =============================================================================
# CLIENTS & SUPPLIERS
# =============================================================================

class ClienteViewSet(viewsets.ModelViewSet):
    serializer_class = ClienteSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Cliente.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class ProveedorViewSet(viewsets.ModelViewSet):
    serializer_class = ProveedorSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Proveedor.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


# =============================================================================
# SALES & e-CF
# =============================================================================

class VentaViewSet(viewsets.ModelViewSet):
    serializer_class = VentaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        ventas = Venta.objects.filter(negocio=user.negocio)
        if user.rol == 'CAJERO':
            ventas = ventas.filter(cajero=user)
        return ventas.order_by('-fecha')

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio, cajero=self.request.user)

    @action(detail=False, methods=['get'])
    def dashboard(self, request):
        hoy = timezone.now().date()
        user = request.user
        ventas = Venta.objects.filter(
            negocio=user.negocio, fecha__date=hoy, estado='COMPLETADA',
        )
        data = ventas.aggregate(
            total_ventas=Sum('total'),
            total_ganancia=Sum('ganancia'),
            cantidad=Count('id'),
        )
        total = data['total_ventas'] or 0
        cantidad = data['cantidad'] or 0

        can_see_profit = (
            user.puede_ver_costos
            or user.rol in ('ADMIN_NEGOCIO', 'SUPER_ADMIN', 'CONTADOR', 'GERENTE')
        )

        return Response({
            'total_ventas': total,
            'total_ganancia': data['total_ganancia'] or 0 if can_see_profit else None,
            'cantidad_ventas': cantidad,
            'ticket_promedio': round(total / cantidad, 2) if cantidad > 0 else 0,
        })

    @action(detail=True, methods=['post'], url_path='emitir-ecf')
    def emitir_ecf(self, request, pk=None):
        """Generate, sign, and submit an e-CF to DGII."""
        venta = self.get_object()

        # --- Permission check ---
        if request.user.rol not in ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'GERENTE'):
            raise PermissionDenied('No tiene permisos para emitir facturas electronicas.')

        # --- Ownership check ---
        if str(venta.negocio_id) != str(request.user.negocio_id):
            raise PermissionDenied('No autorizado para esta venta.')

        if venta.estado != 'COMPLETADA':
            raise ValidationError('Solo se pueden emitir facturas de ventas completadas.')

        if hasattr(venta, 'ecf_data') and venta.ecf_data.xml_firmado:
            raise ValidationError('Esta venta ya tiene un e-CF generado.')

        # --- Certificate validation ---
        negocio = venta.negocio
        p12_path = negocio.certificado_digital_path
        p12_pass = os.getenv(negocio.certificado_pass_env) if negocio.certificado_pass_env else None

        if not p12_path or not p12_pass:
            raise ValidationError('Certificado digital no configurado en el Negocio.')

        if not os.path.exists(p12_path):
            logger.error('Certificate file not found: %s (negocio: %s)', p12_path, negocio.id)
            raise ValidationError(
                'Archivo de certificado digital no encontrado. Verifique la configuracion.'
            )

        try:
            with transaction.atomic():
                # 1. Generate XML
                generator = ECFGenerator(venta)
                xml_content = generator.generate_xml()

                # 2. Sign XML (MUST succeed - no fallback)
                xml_firmado = sign_ecf_xml(
                    xml_content.encode('utf-8'), p12_path, p12_pass,
                )

                # 3. Create / update e-CF record
                ecf_record, _ = FacturaElectronica.objects.get_or_create(
                    venta=venta,
                    defaults={'ecf_tipo': '31'},
                )
                ecf_record.xml_firmado = xml_firmado
                ecf_record.fecha_firma = timezone.now()
                ecf_record.track_id = f"TRACK-{uuid.uuid4().hex[:10].upper()}"
                ecf_record.save()

                # 4. Update sale fiscal status
                venta.estado_fiscal = 'ENVIADO'
                venta.save(update_fields=['estado_fiscal'])

                logger.info(
                    'e-CF emitted: venta=%s track=%s user=%s',
                    venta.numero, ecf_record.track_id, request.user.username,
                )

                return Response({
                    'status': 'success',
                    'track_id': ecf_record.track_id,
                    'xml_preview': xml_firmado[:200] + '...',
                })

        except (FileNotFoundError, OSError) as e:
            logger.error('Certificate error for venta %s: %s', venta.numero, e)
            raise ValidationError(f'Error de certificado: {e}')
        except Exception as e:
            logger.error('e-CF generation failed for venta %s: %s', venta.numero, e)
            return Response({'error': 'Error generando e-CF. Contacte al administrador.'}, status=500)


# =============================================================================
# FISCAL REPORTS
# =============================================================================

class ReporteFiscalViewSet(viewsets.ViewSet):
    """Fiscal reports (DGII 606/607) via Strategy Pattern."""
    permission_classes = [IsAuthenticated, CanViewReports]

    def _get_params(self, request):
        try:
            year = int(request.query_params.get('year', 0))
            month = int(request.query_params.get('month', 0))
        except (ValueError, TypeError):
            raise ValidationError("Parametros 'year' y 'month' deben ser numeros.")

        if not (2000 <= year <= 2100):
            raise ValidationError('Anio debe estar entre 2000 y 2100.')
        if not (1 <= month <= 12):
            raise ValidationError('Mes debe estar entre 1 y 12.')
        return year, month

    @action(detail=False, methods=['get'])
    def preview(self, request):
        """JSON preview for frontend."""
        year, month = self._get_params(request)
        tipo = request.query_params.get('tipo', '607')

        if tipo not in ('606', '607'):
            raise ValidationError('Tipo de reporte no valido. Use 606 o 607.')

        strategy = FiscalStrategyFactory.get_strategy(request.user.negocio)

        if tipo == '607':
            data = strategy.generar_reporte_ventas(year, month)
        else:
            data = strategy.generar_reporte_compras(year, month)

        return Response(data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Download file for fiscal declaration."""
        if not (request.user.puede_exportar_datos
                or request.user.rol in ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR')):
            raise PermissionDenied('No tiene permisos para exportar datos.')

        year, month = self._get_params(request)
        tipo = request.query_params.get('tipo', '607')

        if tipo not in ('606', '607'):
            raise ValidationError('Tipo de reporte no valido.')

        strategy = FiscalStrategyFactory.get_strategy(request.user.negocio)
        content, filename, content_type = strategy.exportar_archivo(tipo, year, month)

        # Audit log
        if request.user.negocio:
            AuditLog.objects.create(
                negocio=request.user.negocio,
                usuario=request.user,
                accion='EXPORT',
                modelo='ReporteFiscal',
                objeto_id=f'{tipo}-{year}{month:02d}',
                descripcion=f'Exportacion reporte {tipo} periodo {year}-{month:02d}',
                ip_address=_get_client_ip(request),
            )

        response = HttpResponse(content, content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


# =============================================================================
# CASH & AI
# =============================================================================

class CuadreCajaViewSet(viewsets.ModelViewSet):
    serializer_class = CuadreCajaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CuadreCaja.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio, cajero=self.request.user)


class AnalisisAIViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AnalisisAISerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return AnalisisAI.objects.filter(negocio=self.request.user.negocio)
