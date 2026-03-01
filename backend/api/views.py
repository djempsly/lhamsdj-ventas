from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db import transaction, DatabaseError
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from django.http import HttpResponse
from .models import (
    Pais, Moneda, Negocio, Sucursal, Usuario,
    CuentaContable, Categoria, Producto, Almacen,
    Cliente, Proveedor, Venta, DetalleVenta, CuadreCaja, AnalisisAI,
    FacturaElectronica
)
from .serializers import (
    PaisSerializer, MonedaSerializer, NegocioSerializer, SucursalSerializer,
    UsuarioSerializer, CuentaContableSerializer, CategoriaSerializer,
    ProductoSerializer, ClienteSerializer, ProveedorSerializer,
    VentaSerializer, DetalleVentaSerializer, CuadreCajaSerializer, AnalisisAISerializer
)
from .utils.ecf_generator import ECFGenerator
from .utils.xml_signer import sign_ecf_xml
from .fiscal.strategies.dgii import FiscalStrategyFactory
import os


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
            }
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


class PaisViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Pais.objects.filter(activo=True)
    serializer_class = PaisSerializer
    permission_classes = [IsAuthenticated]


class MonedaViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Moneda.objects.all()
    serializer_class = MonedaSerializer
    permission_classes = [IsAuthenticated]


class NegocioViewSet(viewsets.ModelViewSet):
    serializer_class = NegocioSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.rol == 'SUPER_ADMIN':
            return Negocio.objects.all()
        return Negocio.objects.filter(id=user.negocio_id)


class SucursalViewSet(viewsets.ModelViewSet):
    serializer_class = SucursalSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Sucursal.objects.filter(negocio=self.request.user.negocio)
    
    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class UsuarioViewSet(viewsets.ModelViewSet):
    serializer_class = UsuarioSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        if user.rol == 'SUPER_ADMIN':
            return Usuario.objects.all()
        return Usuario.objects.filter(negocio=user.negocio)


class CuentaContableViewSet(viewsets.ModelViewSet):
    serializer_class = CuentaContableSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Optimized: prefetch subcuentas to avoid N+1 queries in recursive serialization
        return CuentaContable.objects.filter(
            negocio=self.request.user.negocio, 
            cuenta_padre__isnull=True # Start from root
        ).prefetch_related('subcuentas__subcuentas')
    
    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class CategoriaViewSet(viewsets.ModelViewSet):
    serializer_class = CategoriaSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Categoria.objects.filter(negocio=self.request.user.negocio)
    
    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)


class ProductoViewSet(viewsets.ModelViewSet):
    serializer_class = ProductoSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Producto.objects.filter(negocio=self.request.user.negocio, activo=True)
    
    def perform_create(self, serializer):
        serializer.save(negocio=self.request.user.negocio)
    
    @action(detail=False, methods=['get'])
    def buscar(self, request):
        q = request.query_params.get('q', '')
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
        ventas = Venta.objects.filter(negocio=user.negocio, fecha__date=hoy, estado='COMPLETADA')
        
        data = ventas.aggregate(
            total_ventas=Sum('total'),
            total_ganancia=Sum('ganancia'),
            cantidad=Count('id')
        )
        
        total = data['total_ventas'] or 0
        cantidad = data['cantidad'] or 0
        
        return Response({
            'total_ventas': total,
            'total_ganancia': data['total_ganancia'] or 0 if user.puede_ver_costos or user.rol in ['ADMIN_NEGOCIO', 'SUPER_ADMIN', 'CONTADOR'] else None,
            'cantidad_ventas': cantidad,
            'ticket_promedio': round(total / cantidad, 2) if cantidad > 0 else 0,
        })

    @action(detail=True, methods=['post'], url_path='emitir-ecf')
    def emitir_ecf(self, request, pk=None):
        """
        Genera, firma y "envía" (simulado) el e-CF a la DGII.
        """
        venta = self.get_object()
        
        if venta.estado != 'COMPLETADA':
            return Response({"error": "Solo se pueden emitir facturas de ventas completadas."}, status=400)
        
        if hasattr(venta, 'ecf_data') and venta.ecf_data.xml_firmado:
            return Response({"error": "Esta venta ya tiene un e-CF generado."}, status=400)

        # Verificar configuración de certificado
        negocio = venta.negocio
        p12_path = negocio.certificado_digital_path
        p12_pass = os.getenv(negocio.certificado_pass_env) if negocio.certificado_pass_env else None

        if not p12_path or not p12_pass:
             # FAIL-SAFE: If no cert configured, we cannot sign.
             # In production, raise error. Here we might log it.
             return Response({"error": "Certificado digital no configurado en el Negocio."}, status=500)

        try:
            with transaction.atomic():
                # 1. Crear registro e-CF inicial
                ecf_record, created = FacturaElectronica.objects.get_or_create(
                    venta=venta,
                    defaults={'ecf_tipo': '31'} # Default to Credito Fiscal or logic based on Client
                )
                
                # 2. Generar XML
                generator = ECFGenerator(venta)
                xml_content = generator.generate_xml()
                
                # 3. Firmar XML
                # xml_firmado = sign_ecf_xml(xml_content.encode('utf-8'), p12_path, p12_pass)
                # MOCK SIGNING for development if file missing to avoid crash
                if os.path.exists(p12_path):
                    xml_firmado = sign_ecf_xml(xml_content.encode('utf-8'), p12_path, p12_pass)
                else:
                    # Simulation mode
                    xml_firmado = f"<!-- SIMULATED SIGNATURE -->\n{xml_content}"
                
                # 4. Guardar
                ecf_record.xml_firmado = xml_firmado
                ecf_record.fecha_firma = timezone.now()
                ecf_record.track_id = f"TRACK-{uuid.uuid4().hex[:10].upper()}"
                ecf_record.save()
                
                venta.estado_fiscal = 'ENVIADO'
                venta.save()
                
                return Response({
                    "status": "success",
                    "track_id": ecf_record.track_id,
                    "xml_preview": xml_firmado[:200] + "..."
                })

        except Exception as e:
            return Response({"error": str(e)}, status=500)


class ReporteFiscalViewSet(viewsets.ViewSet):
    """
    ViewSet para generar reportes fiscales (DGII 606/607, etc.)
    Multi-país soportado vía Strategy Pattern.
    """
    permission_classes = [IsAuthenticated]

    def _get_params(self, request):
        year = request.query_params.get('year')
        month = request.query_params.get('month')
        if not year or not month:
            raise ValueError("Parámetros 'year' y 'month' son obligatorios.")
        return int(year), int(month)

    @action(detail=False, methods=['get'])
    def preview(self, request):
        """Devuelve JSON para previsualizar el reporte en Frontend"""
        try:
            year, month = self._get_params(request)
            tipo = request.query_params.get('tipo', '607')
            
            strategy = FiscalStrategyFactory.get_strategy(request.user.negocio)
            
            if tipo == '607':
                data = strategy.generar_reporte_ventas(year, month)
            elif tipo == '606':
                data = strategy.generar_reporte_compras(year, month)
            else:
                return Response({"error": "Tipo de reporte no válido"}, status=400)
                
            return Response(data)
        except Exception as e:
            return Response({"error": str(e)}, status=400)

    @action(detail=False, methods=['get'])
    def export(self, request):
        """Descarga el archivo físico (TXT/XML) para declarar"""
        try:
            year, month = self._get_params(request)
            tipo = request.query_params.get('tipo', '607')
            
            strategy = FiscalStrategyFactory.get_strategy(request.user.negocio)
            content, filename, content_type = strategy.exportar_archivo(tipo, year, month)
            
            response = HttpResponse(content, content_type=content_type)
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
            
        except Exception as e:
            return Response({"error": str(e)}, status=400)


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
