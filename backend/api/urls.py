from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()

# --- Config & Users ---
router.register(r'paises', views.PaisViewSet, basename='pais')
router.register(r'monedas', views.MonedaViewSet, basename='moneda')
router.register(r'negocios', views.NegocioViewSet, basename='negocio')
router.register(r'sucursales', views.SucursalViewSet, basename='sucursal')
router.register(r'usuarios', views.UsuarioViewSet, basename='usuario')

# --- Contabilidad ---
router.register(r'cuentas-contables', views.CuentaContableViewSet, basename='cuenta-contable')
router.register(r'periodos-contables', views.PeriodoContableViewSet, basename='periodo-contable')

# --- Inventario ---
router.register(r'categorias', views.CategoriaViewSet, basename='categoria')
router.register(r'productos', views.ProductoViewSet, basename='producto')

# --- Clientes & Proveedores ---
router.register(r'clientes', views.ClienteViewSet, basename='cliente')
router.register(r'proveedores', views.ProveedorViewSet, basename='proveedor')

# --- Ventas & Compras ---
router.register(r'ventas', views.VentaViewSet, basename='venta')
router.register(r'compras', views.CompraViewSet, basename='compra')

# --- Cotizaciones & Órdenes (Fase 3A) ---
router.register(r'cotizaciones', views.CotizacionViewSet, basename='cotizacion')
router.register(r'ordenes-compra', views.OrdenCompraViewSet, basename='orden-compra')

# --- CxC / CxP / Pagos (Fase 3B) ---
router.register(r'cuentas-por-cobrar', views.CuentaPorCobrarViewSet, basename='cuenta-por-cobrar')
router.register(r'cuentas-por-pagar', views.CuentaPorPagarViewSet, basename='cuenta-por-pagar')
router.register(r'pagos', views.PagoViewSet, basename='pago')

# --- Bancos ---
router.register(r'cuentas-bancarias', views.CuentaBancariaViewSet, basename='cuenta-bancaria')

# --- Caja ---
router.register(r'cuadres', views.CuadreCajaViewSet, basename='cuadre')

# --- Fiscal ---
router.register(r'reportes-fiscales', views.ReporteFiscalViewSet, basename='reportes-fiscales')

# --- AI ---
router.register(r'analisis-ai', views.AnalisisAIViewSet, basename='analisis-ai')

# --- HR / Nómina (Fase 5A) ---
router.register(r'departamentos', views.DepartamentoViewSet, basename='departamento')
router.register(r'empleados', views.EmpleadoViewSet, basename='empleado')
router.register(r'nominas', views.NominaViewSet, basename='nomina')
router.register(r'vacaciones', views.VacacionViewSet, basename='vacacion')

# --- CRM (Fase 5B) ---
router.register(r'crm/etapas', views.EtapaCRMViewSet, basename='crm-etapa')
router.register(r'crm/oportunidades', views.OportunidadViewSet, basename='crm-oportunidad')
router.register(r'crm/actividades', views.ActividadCRMViewSet, basename='crm-actividad')

# --- Multi-moneda (Fase 4A) ---
router.register(r'tasas-cambio', views.TasaCambioViewSet, basename='tasa-cambio')

# --- Exportaciones (Fase 3D) ---
router.register(r'export', views.ExportViewSet, basename='export')

urlpatterns = [
    path('auth/login/', views.CustomLoginView.as_view(), name='login'),
    path('auth/refresh/', views.CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('', include(router.urls)),
]
