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
    CuentaContable, PeriodoContable, AsientoContable, LineaAsiento,
    Categoria, Producto, Almacen,
    Cliente, Proveedor, Venta, DetalleVenta, CuadreCaja, AnalisisAI,
    FacturaElectronica, Compra, DetalleCompra,
    CuentaBancaria, MovimientoBancario, Conciliacion,
)
from .serializers import (
    PaisSerializer, MonedaSerializer, NegocioSerializer, SucursalSerializer,
    UsuarioSerializer, CuentaContableSerializer, CategoriaSerializer,
    ProductoSerializer, ClienteSerializer, ProveedorSerializer,
    VentaSerializer, DetalleVentaSerializer, CuadreCajaSerializer,
    AnalisisAISerializer,
    CompraSerializer, PeriodoContableSerializer,
    CuentaBancariaSerializer, MovimientoBancarioSerializer, ConciliacionSerializer,
)
from .permissions import (
    IsNegocioMember, CanEmitECF, CanViewReports,
    CanExportData, CanManageProducts, CanManageUsers,
)
from .utils.ecf_generator import ECFGenerator
from .utils.xml_signer import sign_ecf_xml
from .utils.cert_validator import validate_p12_certificate
from .utils.ncf_manager import obtener_siguiente_ncf
from .utils.dgii_api import DGIIClient
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


def _cookie_kwargs():
    """Common cookie parameters."""
    kwargs = {
        'httponly': True,
        'secure': settings.COOKIE_SECURE,
        'samesite': 'Lax',
    }
    if settings.COOKIE_DOMAIN:
        kwargs['domain'] = settings.COOKIE_DOMAIN
    return kwargs


def _set_auth_cookies(response, access_token, refresh_token):
    """Set httpOnly cookies for JWT tokens."""
    base = _cookie_kwargs()
    response.set_cookie(
        'access_token',
        str(access_token),
        max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
        path='/',
        **base,
    )
    response.set_cookie(
        'refresh_token',
        str(refresh_token),
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path='/api/auth/',
        **base,
    )
    return response


def _clear_auth_cookies(response):
    """Remove auth cookies."""
    domain = settings.COOKIE_DOMAIN
    response.delete_cookie('access_token', path='/', domain=domain)
    response.delete_cookie('refresh_token', path='/api/auth/', domain=domain)
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
            base = _cookie_kwargs()
            response.set_cookie(
                'access_token',
                new_access,
                max_age=int(settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'].total_seconds()),
                path='/',
                **base,
            )

            # Rotate refresh token
            if settings.SIMPLE_JWT.get('ROTATE_REFRESH_TOKENS'):
                new_refresh = str(token)
                response.set_cookie(
                    'refresh_token',
                    new_refresh,
                    max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
                    path='/api/auth/',
                    **base,
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

    @action(detail=True, methods=['get'], url_path='certificado-status')
    def certificado_status(self, request, pk=None):
        """GET /negocios/{id}/certificado-status/ — consulta estado del certificado digital."""
        negocio = self.get_object()
        p12_path = negocio.certificado_digital_path
        p12_pass = os.getenv(negocio.certificado_pass_env) if negocio.certificado_pass_env else None

        if not p12_path or not p12_pass:
            return Response({
                'configurado': False,
                'error': 'Certificado digital no configurado.',
            })

        cert_info = validate_p12_certificate(p12_path, p12_pass)
        cert_info['configurado'] = True
        return Response(cert_info)


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

    @action(detail=False, methods=['get'], url_path='balance-general')
    def balance_general(self, request):
        """GET /cuentas-contables/balance-general/?fecha=2024-12-31"""
        from .utils.estados_financieros import generar_balance_general
        from datetime import date

        fecha_str = request.query_params.get('fecha')
        if fecha_str:
            try:
                fecha = date.fromisoformat(fecha_str)
            except ValueError:
                raise ValidationError('Formato de fecha inválido. Use YYYY-MM-DD.')
        else:
            fecha = timezone.now().date()

        data = generar_balance_general(request.user.negocio, fecha)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='estado-resultados')
    def estado_resultados(self, request):
        """GET /cuentas-contables/estado-resultados/?desde=2024-01-01&hasta=2024-12-31"""
        from .utils.estados_financieros import generar_estado_resultados
        from datetime import date

        desde_str = request.query_params.get('desde')
        hasta_str = request.query_params.get('hasta')
        if not desde_str or not hasta_str:
            raise ValidationError('Parámetros desde y hasta son requeridos.')
        try:
            desde = date.fromisoformat(desde_str)
            hasta = date.fromisoformat(hasta_str)
        except ValueError:
            raise ValidationError('Formato de fecha inválido. Use YYYY-MM-DD.')

        data = generar_estado_resultados(request.user.negocio, desde, hasta)
        return Response(data)


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
        import random

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

        # Validate certificate before signing
        cert_status = validate_p12_certificate(p12_path, p12_pass)
        if not cert_status['valid']:
            raise ValidationError(f'Certificado digital inválido: {cert_status["error"]}')

        try:
            with transaction.atomic():
                # 0. Auto-assign NCF if not present
                if not venta.ncf:
                    tipo = venta.tipo_comprobante or 'B02'
                    venta.ncf = obtener_siguiente_ncf(negocio, tipo)
                    venta.tipo_comprobante = tipo

                # Generate security code (6 random digits)
                codigo_seguridad = f"{random.randint(0, 999999):06d}"
                venta.codigo_seguridad_dgii = codigo_seguridad
                venta.save(update_fields=['ncf', 'tipo_comprobante', 'codigo_seguridad_dgii'])

                # Determine e-CF type
                tipo_ecf_map = {
                    'B01': '31', 'B02': '32', 'B03': '33', 'B04': '34',
                    'B11': '41', 'B13': '43', 'B14': '44', 'B15': '45',
                }
                ecf_tipo = tipo_ecf_map.get(venta.tipo_comprobante, '32')

                # 1. Generate XML
                generator = ECFGenerator(venta)
                xml_content = generator.generate_xml()

                # 2. Sign XML
                xml_firmado = sign_ecf_xml(
                    xml_content.encode('utf-8'), p12_path, p12_pass,
                )

                # 3. Create / update e-CF record
                ecf_record, _ = FacturaElectronica.objects.get_or_create(
                    venta=venta,
                    defaults={'ecf_tipo': ecf_tipo},
                )
                ecf_record.ecf_tipo = ecf_tipo
                ecf_record.xml_firmado = xml_firmado
                ecf_record.fecha_firma = timezone.now()

                # 4. Send to DGII API
                dgii_client = DGIIClient(
                    ambiente=negocio.ambiente_fiscal,
                    rnc=negocio.identificacion_fiscal.replace('-', ''),
                    usuario=negocio.api_fiscal_usuario,
                    clave=negocio.api_fiscal_clave_decrypted,
                )
                dgii_response = dgii_client.enviar_ecf(xml_firmado)

                ecf_record.track_id = dgii_response.get('track_id') or f"TRACK-{uuid.uuid4().hex[:10].upper()}"
                ecf_record.respuesta_dgii = dgii_response.get('respuesta_cruda')

                # 5. Generate QR URL
                rnc = negocio.identificacion_fiscal.replace('-', '')
                ecf_record.qr_code_url = (
                    f"https://dgii.gov.do/ecf?rnc={rnc}&encf={venta.ncf}&sc={codigo_seguridad}"
                )
                ecf_record.save()

                # 6. Update fiscal status based on DGII response
                dgii_estado = dgii_response.get('estado', '')
                if dgii_estado == 'ERROR':
                    venta.estado_fiscal = 'EN_CONTINGENCIA'
                elif dgii_estado == 'RECHAZADO':
                    venta.estado_fiscal = 'RECHAZADO'
                else:
                    venta.estado_fiscal = 'ENVIADO'
                venta.save(update_fields=['estado_fiscal'])

                logger.info(
                    'e-CF emitted: venta=%s ncf=%s track=%s dgii_status=%s user=%s',
                    venta.numero, venta.ncf, ecf_record.track_id,
                    dgii_estado, request.user.username,
                )

                return Response({
                    'status': 'success',
                    'ncf': venta.ncf,
                    'codigo_seguridad': codigo_seguridad,
                    'track_id': ecf_record.track_id,
                    'dgii_estado': dgii_estado,
                    'qr_url': ecf_record.qr_code_url,
                    'xml_preview': xml_firmado[:200] + '...',
                })

        except ValueError as e:
            raise ValidationError(str(e))
        except (FileNotFoundError, OSError) as e:
            logger.error('Certificate error for venta %s: %s', venta.numero, e)
            raise ValidationError(f'Error de certificado: {e}')
        except Exception as e:
            logger.error('e-CF generation failed for venta %s: %s', venta.numero, e)
            return Response({'error': 'Error generando e-CF. Contacte al administrador.'}, status=500)

    @action(detail=True, methods=['post'], url_path='anular')
    def anular_venta(self, request, pk=None):
        """Anula una venta y genera una Nota de Crédito (e-CF tipo 34)."""
        venta_original = self.get_object()

        if request.user.rol not in ('SUPER_ADMIN', 'ADMIN_NEGOCIO', 'CONTADOR', 'GERENTE'):
            raise PermissionDenied('No tiene permisos para anular ventas.')

        if venta_original.estado == 'ANULADA':
            raise ValidationError('Esta venta ya está anulada.')

        if venta_original.estado != 'COMPLETADA':
            raise ValidationError('Solo se pueden anular ventas completadas.')

        try:
            with transaction.atomic():
                # Create nota de crédito
                nota_credito = Venta.objects.create(
                    negocio=venta_original.negocio,
                    sucursal=venta_original.sucursal,
                    numero=f"NC-{venta_original.numero}",
                    tipo_comprobante='B04',
                    cliente=venta_original.cliente,
                    cajero=request.user,
                    subtotal=venta_original.subtotal,
                    descuento=venta_original.descuento,
                    subtotal_con_descuento=venta_original.subtotal_con_descuento,
                    total_impuestos=venta_original.total_impuestos,
                    total=venta_original.total,
                    costo_total=venta_original.costo_total,
                    tipo_pago=venta_original.tipo_pago,
                    monto_pagado=venta_original.total,
                    estado='COMPLETADA',
                    venta_referencia=venta_original,
                    notas=f'Nota de Crédito por anulación de venta {venta_original.numero}',
                )

                # Revert stock
                for detalle in venta_original.detalles.all():
                    detalle.producto.stock_actual += detalle.cantidad
                    detalle.producto.save(update_fields=['stock_actual'])

                # Mark original as annulled
                venta_original.estado = 'ANULADA'
                venta_original.save(update_fields=['estado'])

                return Response({
                    'status': 'success',
                    'nota_credito_id': str(nota_credito.id),
                    'nota_credito_numero': nota_credito.numero,
                })

        except Exception as e:
            logger.error('Error anulando venta %s: %s', venta_original.numero, e)
            return Response({'error': str(e)}, status=500)


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

        if tipo not in ('606', '607', '608'):
            raise ValidationError('Tipo de reporte no valido. Use 606, 607 o 608.')

        strategy = FiscalStrategyFactory.get_strategy(request.user.negocio)

        if tipo == '607':
            data = strategy.generar_reporte_ventas(year, month)
        elif tipo == '608':
            data = strategy.generar_reporte_anulaciones(year, month)
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

        if tipo not in ('606', '607', '608'):
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

    @action(detail=False, methods=['post'], url_path='generar')
    def generar(self, request):
        """POST /analisis-ai/generar/ — ejecuta análisis AI bajo demanda."""
        from .utils.ai_engine import analizar_ventas, detectar_anomalias, generar_recomendaciones

        tipo = request.data.get('tipo', 'INSIGHT')
        negocio = request.user.negocio

        if tipo == 'ANOMALIA':
            analisis = detectar_anomalias(negocio)
        elif tipo == 'RECOMENDACION':
            analisis = generar_recomendaciones(negocio)
        else:
            dias = int(request.data.get('dias', 30))
            analisis = analizar_ventas(negocio, dias)

        serializer = self.get_serializer(analisis)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


# =============================================================================
# COMPRAS
# =============================================================================

class CompraViewSet(viewsets.ModelViewSet):
    serializer_class = CompraSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Compra.objects.filter(
            negocio=self.request.user.negocio,
        ).select_related('proveedor').order_by('-fecha')

    def perform_create(self, serializer):
        negocio = self.request.user.negocio
        count = Compra.objects.filter(negocio=negocio).count()
        numero = f"CMP-{count + 1:06d}"
        serializer.save(negocio=negocio, numero=numero)

    @action(detail=True, methods=['post'])
    def recibir(self, request, pk=None):
        """Marca la compra como recibida y actualiza stock."""
        compra = self.get_object()

        if compra.estado != 'BORRADOR':
            raise ValidationError('Solo se pueden recibir compras en estado borrador.')

        with transaction.atomic():
            compra.estado = 'RECIBIDA'
            compra.fecha_recepcion = timezone.now().date()
            compra.save(update_fields=['estado', 'fecha_recepcion'])

            for detalle in compra.detalles.all():
                detalle.producto.stock_actual += detalle.cantidad
                detalle.producto.save(update_fields=['stock_actual'])

        serializer = self.get_serializer(compra)
        return Response(serializer.data)


# =============================================================================
# PERÍODO CONTABLE
# =============================================================================

class PeriodoContableViewSet(viewsets.ModelViewSet):
    serializer_class = PeriodoContableSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PeriodoContable.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)

    @action(detail=True, methods=['post'])
    def cerrar(self, request, pk=None):
        """Cierra un período contable."""
        periodo = self.get_object()

        if periodo.estado == 'CERRADO':
            raise ValidationError('Este período ya está cerrado.')

        # Verificar que no hay asientos en borrador
        borradores = AsientoContable.objects.filter(
            negocio=request.user.negocio,
            periodo=periodo,
            estado='BORRADOR',
        ).count()

        if borradores > 0:
            raise ValidationError(
                f'Hay {borradores} asiento(s) en borrador. Contabilice o anule antes de cerrar.'
            )

        with transaction.atomic():
            # Generate closing entry — move income/expense to equity
            ingresos = LineaAsiento.objects.filter(
                asiento__periodo=periodo,
                asiento__estado='CONTABILIZADO',
                cuenta__tipo='INGRESO',
            ).aggregate(
                debe=Sum('debe'), haber=Sum('haber'),
            )
            gastos = LineaAsiento.objects.filter(
                asiento__periodo=periodo,
                asiento__estado='CONTABILIZADO',
                cuenta__tipo__in=['GASTO', 'COSTO'],
            ).aggregate(
                debe=Sum('debe'), haber=Sum('haber'),
            )

            total_ingresos = (ingresos['haber'] or 0) - (ingresos['debe'] or 0)
            total_gastos = (gastos['debe'] or 0) - (gastos['haber'] or 0)
            resultado = total_ingresos - total_gastos

            if abs(resultado) > 0:
                # Create closing entry
                from decimal import Decimal
                negocio = request.user.negocio
                count = AsientoContable.objects.filter(negocio=negocio).count()
                asiento_cierre = AsientoContable.objects.create(
                    negocio=negocio,
                    periodo=periodo,
                    numero=f"AST-{count + 1:06d}",
                    fecha=periodo.fecha_fin,
                    tipo='CIERRE',
                    descripcion=f'Asiento de cierre período {periodo.nombre}',
                    referencia=f'CIERRE-{periodo.nombre}',
                    creado_por=request.user,
                )

                # Find resultado del ejercicio account
                resultado_cuenta = CuentaContable.objects.filter(
                    negocio=negocio,
                    tipo='PATRIMONIO',
                    es_cuenta_detalle=True,
                    activa=True,
                ).first()

                if resultado_cuenta:
                    if resultado >= 0:
                        LineaAsiento.objects.create(
                            asiento=asiento_cierre,
                            cuenta=resultado_cuenta,
                            descripcion='Resultado del ejercicio',
                            debe=Decimal('0'),
                            haber=abs(resultado),
                        )
                        # Balancing debit entry
                        ingreso_cuenta = CuentaContable.objects.filter(
                            negocio=negocio, tipo='INGRESO',
                            es_cuenta_detalle=True, activa=True,
                        ).first()
                        if ingreso_cuenta:
                            LineaAsiento.objects.create(
                                asiento=asiento_cierre,
                                cuenta=ingreso_cuenta,
                                descripcion='Cierre ingresos',
                                debe=abs(resultado),
                                haber=Decimal('0'),
                            )
                    else:
                        LineaAsiento.objects.create(
                            asiento=asiento_cierre,
                            cuenta=resultado_cuenta,
                            descripcion='Pérdida del ejercicio',
                            debe=abs(resultado),
                            haber=Decimal('0'),
                        )
                        gasto_cuenta = CuentaContable.objects.filter(
                            negocio=negocio, tipo='GASTO',
                            es_cuenta_detalle=True, activa=True,
                        ).first()
                        if gasto_cuenta:
                            LineaAsiento.objects.create(
                                asiento=asiento_cierre,
                                cuenta=gasto_cuenta,
                                descripcion='Cierre gastos',
                                debe=Decimal('0'),
                                haber=abs(resultado),
                            )

                    asiento_cierre.contabilizar()

            periodo.estado = 'CERRADO'
            periodo.cerrado_por = request.user
            periodo.fecha_cierre = timezone.now()
            periodo.save()

        serializer = self.get_serializer(periodo)
        return Response(serializer.data)


# =============================================================================
# RECONCILIACIÓN BANCARIA
# =============================================================================

class CuentaBancariaViewSet(viewsets.ModelViewSet):
    serializer_class = CuentaBancariaSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return CuentaBancaria.objects.filter(negocio=self.request.user.negocio)

    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)

    @action(detail=True, methods=['get'])
    def movimientos(self, request, pk=None):
        """GET /cuentas-bancarias/{id}/movimientos/"""
        cuenta = self.get_object()
        movimientos = MovimientoBancario.objects.filter(cuenta=cuenta)
        serializer = MovimientoBancarioSerializer(movimientos, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='importar-movimientos')
    def importar_movimientos(self, request, pk=None):
        """POST /cuentas-bancarias/{id}/importar-movimientos/ — acepta CSV con movimientos."""
        import csv
        import io

        cuenta = self.get_object()
        archivo = request.FILES.get('archivo')

        if not archivo:
            raise ValidationError('Se requiere un archivo CSV.')

        try:
            decoded = archivo.read().decode('utf-8')
            reader = csv.DictReader(io.StringIO(decoded))

            created = 0
            for row in reader:
                from datetime import date as dt_date
                MovimientoBancario.objects.create(
                    cuenta=cuenta,
                    fecha=dt_date.fromisoformat(row.get('fecha', '')),
                    descripcion=row.get('descripcion', '')[:300],
                    referencia=row.get('referencia', '')[:100],
                    monto=row.get('monto', 0),
                    tipo=row.get('tipo', 'DEBITO').upper(),
                    saldo_posterior=row.get('saldo', 0),
                    importado_de=archivo.name[:100],
                )
                created += 1

            return Response({
                'status': 'success',
                'movimientos_importados': created,
            })
        except Exception as e:
            raise ValidationError(f'Error procesando archivo: {e}')

    @action(detail=True, methods=['post'])
    def conciliar(self, request, pk=None):
        """POST /cuentas-bancarias/{id}/conciliar/ — match automático entre movimientos y asientos."""
        from decimal import Decimal as D

        cuenta = self.get_object()
        fecha_desde = request.data.get('fecha_desde')
        fecha_hasta = request.data.get('fecha_hasta')
        saldo_extracto = D(str(request.data.get('saldo_extracto', 0)))

        if not fecha_desde or not fecha_hasta:
            raise ValidationError('fecha_desde y fecha_hasta son requeridos.')

        from datetime import date as dt_date
        fecha_desde = dt_date.fromisoformat(fecha_desde)
        fecha_hasta = dt_date.fromisoformat(fecha_hasta)

        movimientos = MovimientoBancario.objects.filter(
            cuenta=cuenta,
            fecha__gte=fecha_desde,
            fecha__lte=fecha_hasta,
            conciliado=False,
        )

        # Try auto-match: find asientos with same amount and similar date
        matched = 0
        for mov in movimientos:
            asiento = AsientoContable.objects.filter(
                negocio=self.request.user.negocio,
                estado='CONTABILIZADO',
                fecha__gte=mov.fecha - timedelta(days=3),
                fecha__lte=mov.fecha + timedelta(days=3),
                total_debe=mov.monto if mov.tipo == 'DEBITO' else 0,
                total_haber=mov.monto if mov.tipo == 'CREDITO' else 0,
            ).first()

            if asiento:
                mov.conciliado = True
                mov.asiento_contable = asiento
                mov.save(update_fields=['conciliado', 'asiento_contable'])
                matched += 1

        # Calculate book balance
        saldo_libros = cuenta.saldo

        conciliacion = Conciliacion.objects.create(
            cuenta_bancaria=cuenta,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta,
            saldo_extracto=saldo_extracto,
            saldo_libros=saldo_libros,
            diferencia=saldo_extracto - saldo_libros,
            creado_por=request.user,
        )

        return Response({
            'status': 'success',
            'conciliacion_id': str(conciliacion.id),
            'movimientos_conciliados': matched,
            'movimientos_pendientes': movimientos.filter(conciliado=False).count(),
            'diferencia': float(conciliacion.diferencia),
        })
