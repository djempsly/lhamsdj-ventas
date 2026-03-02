import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .factories import (
    PaisFactory, MonedaFactory, NegocioFactory, SucursalFactory,
    UsuarioFactory, CategoriaFactory, ProductoFactory, ClienteFactory,
    ProveedorFactory, CuentaContableFactory, PeriodoContableFactory,
    VentaFactory, CompraFactory, CuentaBancariaFactory,
)


@pytest.mark.django_db
class TestPais:
    def test_create(self):
        pais = PaisFactory()
        assert pais.codigo == 'DO'
        assert pais.nombre == 'República Dominicana'
        assert str(pais) is not None

    def test_unique_codigo(self):
        PaisFactory(codigo='DO')
        with pytest.raises(IntegrityError):
            PaisFactory(codigo='DO')


@pytest.mark.django_db
class TestMoneda:
    def test_create(self):
        moneda = MonedaFactory()
        assert moneda.codigo == 'DOP'
        assert moneda.tasa_cambio == Decimal('1.00')


@pytest.mark.django_db
class TestNegocio:
    def test_create(self):
        negocio = NegocioFactory()
        assert negocio.nombre_comercial.startswith('Negocio Test')
        assert negocio.estado_licencia == 'ACTIVA'
        assert negocio.id is not None

    def test_tiene_pais(self):
        negocio = NegocioFactory()
        assert negocio.pais.codigo == 'DO'

    def test_tiene_moneda(self):
        negocio = NegocioFactory()
        assert negocio.moneda_principal.codigo == 'DOP'


@pytest.mark.django_db
class TestSucursal:
    def test_create(self):
        sucursal = SucursalFactory()
        assert sucursal.es_principal is True
        assert sucursal.negocio is not None

    def test_unique_negocio_codigo(self):
        negocio = NegocioFactory()
        SucursalFactory(negocio=negocio, codigo='S001')
        with pytest.raises(IntegrityError):
            SucursalFactory(negocio=negocio, codigo='S001')


@pytest.mark.django_db
class TestUsuario:
    def test_create(self):
        usuario = UsuarioFactory()
        assert usuario.rol == 'ADMIN_NEGOCIO'
        assert usuario.check_password('TestPass123!')

    def test_permisos(self):
        usuario = UsuarioFactory(puede_ver_costos=True, puede_anular_ventas=False)
        assert usuario.puede_ver_costos is True
        assert usuario.puede_anular_ventas is False

    def test_roles(self):
        for rol in ['SUPER_ADMIN', 'ADMIN_NEGOCIO', 'GERENTE', 'CONTADOR', 'CAJERO', 'VENDEDOR', 'ALMACEN']:
            u = UsuarioFactory(rol=rol)
            assert u.rol == rol


@pytest.mark.django_db
class TestProducto:
    def test_create(self):
        producto = ProductoFactory()
        assert producto.precio_venta == Decimal('150.00')
        assert producto.activo is True

    def test_ganancia(self):
        producto = ProductoFactory(precio_costo=Decimal('100'), precio_venta=Decimal('150'))
        assert producto.ganancia == Decimal('50.00')

    def test_margen(self):
        producto = ProductoFactory(precio_costo=Decimal('100'), precio_venta=Decimal('200'))
        assert producto.margen == Decimal('50.00')

    def test_auto_codigo_barras(self):
        producto = ProductoFactory(codigo_barras='')
        assert producto.codigo_barras != ''


@pytest.mark.django_db
class TestCliente:
    def test_create(self):
        cliente = ClienteFactory()
        assert cliente.tipo_cliente == 'FINAL'
        assert cliente.activo is True

    def test_unique_documento(self):
        negocio = NegocioFactory()
        ClienteFactory(negocio=negocio, numero_documento='123456789')
        with pytest.raises(IntegrityError):
            ClienteFactory(negocio=negocio, numero_documento='123456789')


@pytest.mark.django_db
class TestCuentaContable:
    def test_create(self):
        cuenta = CuentaContableFactory()
        assert cuenta.tipo == 'ACTIVO'
        assert cuenta.naturaleza == 'DEUDORA'

    def test_jerarquia(self):
        padre = CuentaContableFactory(codigo='1-0000', es_cuenta_detalle=False)
        hija = CuentaContableFactory(
            negocio=padre.negocio,
            codigo='1-0001',
            cuenta_padre=padre,
            nivel=2,
        )
        assert hija.cuenta_padre == padre


@pytest.mark.django_db
class TestVenta:
    def test_create(self):
        venta = VentaFactory()
        assert venta.total == Decimal('1180.00')
        assert venta.estado == 'COMPLETADA'

    def test_estados(self):
        for estado in ['BORRADOR', 'COMPLETADA', 'ANULADA']:
            v = VentaFactory(estado=estado)
            assert v.estado == estado


@pytest.mark.django_db
class TestCompra:
    def test_create(self):
        compra = CompraFactory()
        assert compra.total == Decimal('5900.00')
        assert compra.estado == 'BORRADOR'

    def test_tipo_bienes_servicios(self):
        compra = CompraFactory(tipo_bienes_servicios='03')
        assert compra.tipo_bienes_servicios == '03'


@pytest.mark.django_db
class TestCuentaBancaria:
    def test_create(self):
        cuenta = CuentaBancariaFactory()
        assert cuenta.banco == 'Banco Popular'
        assert cuenta.activa is True


@pytest.mark.django_db
class TestAsientoContable:
    def test_double_entry_validation(self):
        from api.models import AsientoContable, LineaAsiento
        negocio = NegocioFactory()
        periodo = PeriodoContableFactory(negocio=negocio)
        cuenta1 = CuentaContableFactory(negocio=negocio, codigo='1-0001')
        cuenta2 = CuentaContableFactory(negocio=negocio, codigo='4-0001', tipo='INGRESO', naturaleza='ACREEDORA')

        asiento = AsientoContable.objects.create(
            negocio=negocio,
            periodo=periodo,
            numero='AST-001',
            fecha='2024-01-15',
            tipo='MANUAL',
            descripcion='Test',
        )
        LineaAsiento.objects.create(asiento=asiento, cuenta=cuenta1, debe=Decimal('1000'), haber=Decimal('0'))
        LineaAsiento.objects.create(asiento=asiento, cuenta=cuenta2, debe=Decimal('0'), haber=Decimal('1000'))

        asiento.contabilizar()
        asiento.refresh_from_db()
        assert asiento.estado == 'CONTABILIZADO'
        assert asiento.total_debe == Decimal('1000')
        assert asiento.total_haber == Decimal('1000')
