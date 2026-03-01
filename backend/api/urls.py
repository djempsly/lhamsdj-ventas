from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

router = DefaultRouter()
router.register(r'paises', views.PaisViewSet, basename='pais')
router.register(r'monedas', views.MonedaViewSet, basename='moneda')
router.register(r'negocios', views.NegocioViewSet, basename='negocio')
router.register(r'sucursales', views.SucursalViewSet, basename='sucursal')
router.register(r'usuarios', views.UsuarioViewSet, basename='usuario')
router.register(r'cuentas-contables', views.CuentaContableViewSet, basename='cuenta-contable')
router.register(r'categorias', views.CategoriaViewSet, basename='categoria')
router.register(r'productos', views.ProductoViewSet, basename='producto')
router.register(r'clientes', views.ClienteViewSet, basename='cliente')
router.register(r'proveedores', views.ProveedorViewSet, basename='proveedor')
router.register(r'ventas', views.VentaViewSet, basename='venta')
router.register(r'cuadres', views.CuadreCajaViewSet, basename='cuadre')
router.register(r'reportes-fiscales', views.ReporteFiscalViewSet, basename='reportes-fiscales')
router.register(r'analisis-ai', views.AnalisisAIViewSet, basename='analisis-ai')

urlpatterns = [
    path('auth/login/', views.CustomLoginView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('', include(router.urls)),
]
