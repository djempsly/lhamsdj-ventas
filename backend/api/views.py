from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from .models import (
    Pais, Moneda, Negocio, Sucursal, Usuario,
    CuentaContable, Categoria, Producto, Almacen,
    Cliente, Proveedor, Venta, DetalleVenta, CuadreCaja, AnalisisAI
)
from .serializers import (
    PaisSerializer, MonedaSerializer, NegocioSerializer, SucursalSerializer,
    UsuarioSerializer, CuentaContableSerializer, CategoriaSerializer,
    ProductoSerializer, ClienteSerializer, ProveedorSerializer,
    VentaSerializer, DetalleVentaSerializer, CuadreCajaSerializer, AnalisisAISerializer
)


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
        return CuentaContable.objects.filter(negocio=self.request.user.negocio)
    
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
