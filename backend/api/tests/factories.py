import factory
from factory.django import DjangoModelFactory
from decimal import Decimal
from django.utils import timezone


class PaisFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Pais'
        django_get_or_create = ('codigo',)

    codigo = 'DO'
    nombre = 'República Dominicana'
    moneda_codigo = 'DOP'
    moneda_simbolo = 'RD$'
    tasa_impuesto_defecto = Decimal('18.00')
    nombre_impuesto = 'ITBIS'
    activo = True


class MonedaFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Moneda'
        django_get_or_create = ('codigo',)

    codigo = 'DOP'
    nombre = 'Peso Dominicano'
    simbolo = 'RD$'
    tasa_cambio = Decimal('1.00')


class NegocioFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Negocio'

    nombre_comercial = factory.Sequence(lambda n: f'Negocio Test {n}')
    razon_social = factory.LazyAttribute(lambda o: f'{o.nombre_comercial} SRL')
    identificacion_fiscal = factory.Sequence(lambda n: f'1{n:08d}')
    email = factory.LazyAttribute(lambda o: f'{o.nombre_comercial.lower().replace(" ", "")}@test.com')
    pais = factory.SubFactory(PaisFactory)
    moneda_principal = factory.SubFactory(MonedaFactory)
    tipo_licencia = 'MENSUAL'
    fecha_vencimiento = factory.LazyFunction(lambda: timezone.now() + timezone.timedelta(days=365))
    estado_licencia = 'ACTIVA'
    max_usuarios = 10
    max_sucursales = 5
    ambiente_fiscal = 'TEST'


class SucursalFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Sucursal'

    negocio = factory.SubFactory(NegocioFactory)
    nombre = factory.Sequence(lambda n: f'Sucursal {n}')
    codigo = factory.Sequence(lambda n: f'SUC{n:03d}')
    es_principal = True
    activa = True


class UsuarioFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Usuario'

    username = factory.Sequence(lambda n: f'user{n}')
    email = factory.LazyAttribute(lambda o: f'{o.username}@test.com')
    first_name = factory.Faker('first_name', locale='es')
    negocio = factory.SubFactory(NegocioFactory)
    sucursal = factory.SubFactory(SucursalFactory, negocio=factory.SelfAttribute('..negocio'))
    rol = 'ADMIN_NEGOCIO'
    is_active = True
    puede_crear_productos = True
    puede_editar_precios = True
    puede_ver_costos = True
    puede_hacer_descuentos = True
    puede_anular_ventas = True
    puede_ver_reportes = True
    puede_exportar_datos = True

    @factory.post_generation
    def password(self, create, extracted, **kwargs):
        password = extracted or 'TestPass123!'
        self.set_password(password)
        if create:
            self.save()


class CategoriaFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Categoria'

    negocio = factory.SubFactory(NegocioFactory)
    nombre = factory.Sequence(lambda n: f'Categoría {n}')
    codigo = factory.Sequence(lambda n: f'CAT{n:03d}')
    activa = True


class ProductoFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Producto'

    negocio = factory.SubFactory(NegocioFactory)
    categoria = factory.SubFactory(CategoriaFactory, negocio=factory.SelfAttribute('..negocio'))
    nombre = factory.Sequence(lambda n: f'Producto Test {n}')
    codigo_interno = factory.Sequence(lambda n: f'PROD{n:05d}')
    tipo = 'PRODUCTO'
    precio_costo = Decimal('100.00')
    precio_venta = Decimal('150.00')
    stock_actual = 100
    stock_minimo = 10
    stock_maximo = 1000
    unidad_medida = 'UND'
    aplica_impuesto = True
    tasa_impuesto = Decimal('18.00')
    activo = True


class ClienteFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Cliente'

    negocio = factory.SubFactory(NegocioFactory)
    tipo_documento = 'RNC'
    numero_documento = factory.Sequence(lambda n: f'4{n:08d}')
    nombre = factory.Sequence(lambda n: f'Cliente Test {n}')
    tipo_cliente = 'FINAL'
    activo = True


class ProveedorFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Proveedor'

    negocio = factory.SubFactory(NegocioFactory)
    identificacion_fiscal = factory.Sequence(lambda n: f'5{n:08d}')
    nombre = factory.Sequence(lambda n: f'Proveedor Test {n}')
    activo = True


class CuentaContableFactory(DjangoModelFactory):
    class Meta:
        model = 'api.CuentaContable'

    negocio = factory.SubFactory(NegocioFactory)
    codigo = factory.Sequence(lambda n: f'1-{n:04d}')
    nombre = factory.Sequence(lambda n: f'Cuenta {n}')
    tipo = 'ACTIVO'
    naturaleza = 'DEUDORA'
    nivel = 1
    es_cuenta_detalle = True
    activa = True


class PeriodoContableFactory(DjangoModelFactory):
    class Meta:
        model = 'api.PeriodoContable'

    negocio = factory.SubFactory(NegocioFactory)
    nombre = factory.Sequence(lambda n: f'Periodo {n}')
    fecha_inicio = factory.LazyFunction(lambda: timezone.now().date().replace(month=1, day=1))
    fecha_fin = factory.LazyFunction(lambda: timezone.now().date().replace(month=12, day=31))
    estado = 'ABIERTO'


class VentaFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Venta'

    negocio = factory.SubFactory(NegocioFactory)
    sucursal = factory.SubFactory(SucursalFactory, negocio=factory.SelfAttribute('..negocio'))
    numero = factory.Sequence(lambda n: f'V-{n:06d}')
    cajero = factory.SubFactory(UsuarioFactory, negocio=factory.SelfAttribute('..negocio'))
    subtotal = Decimal('1000.00')
    descuento = Decimal('0.00')
    subtotal_con_descuento = Decimal('1000.00')
    total_impuestos = Decimal('180.00')
    total = Decimal('1180.00')
    tipo_pago = 'EFECTIVO'
    monto_pagado = Decimal('1180.00')
    cambio = Decimal('0.00')
    estado = 'COMPLETADA'
    moneda = factory.SubFactory(MonedaFactory)
    tasa_cambio = Decimal('1.00')


class CompraFactory(DjangoModelFactory):
    class Meta:
        model = 'api.Compra'

    negocio = factory.SubFactory(NegocioFactory)
    proveedor = factory.SubFactory(ProveedorFactory, negocio=factory.SelfAttribute('..negocio'))
    numero = factory.Sequence(lambda n: f'CMP-{n:06d}')
    subtotal = Decimal('5000.00')
    total_impuestos = Decimal('900.00')
    total = Decimal('5900.00')
    estado = 'BORRADOR'
    tipo_bienes_servicios = '01'
    forma_pago = 'TRANSFERENCIA'


class CuentaBancariaFactory(DjangoModelFactory):
    class Meta:
        model = 'api.CuentaBancaria'

    negocio = factory.SubFactory(NegocioFactory)
    banco = 'Banco Popular'
    tipo = 'CORRIENTE'
    numero = factory.Sequence(lambda n: f'8{n:09d}')
    moneda = factory.SubFactory(MonedaFactory)
    saldo = Decimal('50000.00')
    activa = True
