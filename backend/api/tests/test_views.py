import pytest
from decimal import Decimal
from rest_framework.test import APIClient
from django.urls import reverse
from .factories import (
    NegocioFactory, UsuarioFactory, ProductoFactory, ClienteFactory,
    ProveedorFactory, CategoriaFactory, CuentaContableFactory,
    VentaFactory, CompraFactory, CuentaBancariaFactory, PeriodoContableFactory,
    SucursalFactory,
)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def negocio():
    return NegocioFactory()


@pytest.fixture
def usuario(negocio):
    return UsuarioFactory(negocio=negocio, rol='ADMIN_NEGOCIO')


@pytest.fixture
def auth_client(api_client, usuario):
    api_client.force_authenticate(user=usuario)
    return api_client


# --- Productos ---

@pytest.mark.django_db
class TestProductoViewSet:
    def test_list(self, auth_client, usuario):
        ProductoFactory.create_batch(3, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/productos/')
        assert response.status_code == 200

    def test_create(self, auth_client, usuario):
        cat = CategoriaFactory(negocio=usuario.negocio)
        response = auth_client.post('/api/v1/productos/', {
            'categoria': str(cat.id),
            'nombre': 'Test Product',
            'precio_costo': '100.00',
            'precio_venta': '150.00',
            'stock_actual': 50,
        })
        assert response.status_code == 201
        assert response.data['nombre'] == 'Test Product'

    def test_buscar(self, auth_client, usuario):
        ProductoFactory(negocio=usuario.negocio, nombre='Coca Cola 2L')
        response = auth_client.get('/api/v1/productos/buscar/?q=Coca')
        assert response.status_code == 200

    def test_stock_bajo(self, auth_client, usuario):
        ProductoFactory(negocio=usuario.negocio, stock_actual=5, stock_minimo=10)
        response = auth_client.get('/api/v1/productos/stock-bajo/')
        assert response.status_code == 200

    def test_unauthenticated(self, api_client):
        response = api_client.get('/api/v1/productos/')
        assert response.status_code in [401, 403]


# --- Clientes ---

@pytest.mark.django_db
class TestClienteViewSet:
    def test_list(self, auth_client, usuario):
        ClienteFactory.create_batch(2, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/clientes/')
        assert response.status_code == 200

    def test_create(self, auth_client, usuario):
        response = auth_client.post('/api/v1/clientes/', {
            'tipo_documento': 'CEDULA',
            'numero_documento': '00112345678',
            'nombre': 'Juan Perez',
        })
        assert response.status_code == 201


# --- Proveedores ---

@pytest.mark.django_db
class TestProveedorViewSet:
    def test_list(self, auth_client, usuario):
        ProveedorFactory.create_batch(2, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/proveedores/')
        assert response.status_code == 200

    def test_create(self, auth_client, usuario):
        response = auth_client.post('/api/v1/proveedores/', {
            'identificacion_fiscal': '999888777',
            'nombre': 'Distribuidora XYZ',
        })
        assert response.status_code == 201


# --- Ventas ---

@pytest.mark.django_db
class TestVentaViewSet:
    def test_list(self, auth_client, usuario):
        VentaFactory.create_batch(2, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/ventas/')
        assert response.status_code == 200

    def test_dashboard(self, auth_client, usuario):
        VentaFactory(negocio=usuario.negocio, estado='COMPLETADA')
        response = auth_client.get('/api/v1/ventas/dashboard/')
        assert response.status_code == 200
        assert 'total_ventas' in response.data

    def test_create_with_detalles(self, auth_client, usuario):
        prod = ProductoFactory(negocio=usuario.negocio)
        suc = SucursalFactory(negocio=usuario.negocio)
        response = auth_client.post('/api/v1/ventas/', {
            'sucursal': str(suc.id),
            'tipo_pago': 'EFECTIVO',
            'detalles_input': [
                {'producto': str(prod.id), 'cantidad': 2, 'precio_unitario': '150.00', 'descuento': '0.00'}
            ],
        }, format='json')
        assert response.status_code == 201


# --- Compras ---

@pytest.mark.django_db
class TestCompraViewSet:
    def test_list(self, auth_client, usuario):
        CompraFactory.create_batch(2, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/compras/')
        assert response.status_code == 200

    def test_create(self, auth_client, usuario):
        prov = ProveedorFactory(negocio=usuario.negocio)
        prod = ProductoFactory(negocio=usuario.negocio)
        response = auth_client.post('/api/v1/compras/', {
            'proveedor': str(prov.id),
            'tipo_bienes_servicios': '01',
            'forma_pago': 'TRANSFERENCIA',
            'detalles_input': [
                {'producto': str(prod.id), 'cantidad': 10, 'precio_unitario': '100.00'}
            ],
        }, format='json')
        assert response.status_code == 201


# --- Contabilidad ---

@pytest.mark.django_db
class TestCuentaContableViewSet:
    def test_list(self, auth_client, usuario):
        CuentaContableFactory.create_batch(3, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/cuentas-contables/')
        assert response.status_code == 200

    def test_balance_general(self, auth_client, usuario):
        CuentaContableFactory(negocio=usuario.negocio, tipo='ACTIVO')
        response = auth_client.get('/api/v1/cuentas-contables/balance-general/')
        assert response.status_code == 200

    def test_estado_resultados(self, auth_client, usuario):
        response = auth_client.get('/api/v1/cuentas-contables/estado-resultados/?desde=2024-01-01&hasta=2024-12-31')
        assert response.status_code == 200


# --- Bancos ---

@pytest.mark.django_db
class TestCuentaBancariaViewSet:
    def test_list(self, auth_client, usuario):
        CuentaBancariaFactory.create_batch(2, negocio=usuario.negocio)
        response = auth_client.get('/api/v1/cuentas-bancarias/')
        assert response.status_code == 200


# --- Periodos Contables ---

@pytest.mark.django_db
class TestPeriodoContableViewSet:
    def test_list(self, auth_client, usuario):
        PeriodoContableFactory(negocio=usuario.negocio)
        response = auth_client.get('/api/v1/periodos-contables/')
        assert response.status_code == 200


# --- Auth ---

@pytest.mark.django_db
class TestAuth:
    def test_login(self, api_client):
        negocio = NegocioFactory()
        usuario = UsuarioFactory(negocio=negocio, username='testlogin')
        response = api_client.post('/api/v1/auth/login/', {
            'username': 'testlogin',
            'password': 'TestPass123!',
        })
        assert response.status_code == 200
        assert 'usuario' in response.data

    def test_login_wrong_password(self, api_client):
        negocio = NegocioFactory()
        UsuarioFactory(negocio=negocio, username='testbad')
        response = api_client.post('/api/v1/auth/login/', {
            'username': 'testbad',
            'password': 'wrongpassword',
        })
        assert response.status_code == 401

    def test_logout(self, auth_client):
        response = auth_client.post('/api/v1/auth/logout/')
        assert response.status_code in [200, 204]


# --- API Docs ---

@pytest.mark.django_db
class TestAPIDocs:
    def test_schema(self, api_client):
        response = api_client.get('/api/v1/schema/')
        assert response.status_code == 200

    def test_swagger_ui(self, api_client):
        response = api_client.get('/api/v1/docs/')
        assert response.status_code == 200
