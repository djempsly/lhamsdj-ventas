import pytest
from decimal import Decimal
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from .factories import (
    PaisFactory, MonedaFactory, NegocioFactory, SucursalFactory,
    UsuarioFactory, CategoriaFactory, ProductoFactory, ClienteFactory,
    ProveedorFactory, CuentaContableFactory, PeriodoContableFactory,
    VentaFactory, CompraFactory, CuentaBancariaFactory,
    CategoriaActivoFactory, ActivoFijoFactory,
    WorkflowConfigFactory, WorkflowStepFactory, SolicitudAprobacionFactory,
    PresupuestoFactory, LineaPresupuestoFactory,
    ArchivoImportacionBancariaFactory, TransaccionBancariaFactory,
)


@pytest.mark.django_db
class TestPais:
    def test_create(self):
        pais = PaisFactory()
        assert pais.codigo == 'DO'
        assert pais.nombre == 'República Dominicana'
        assert str(pais) is not None

    def test_unique_codigo(self):
        from api.models import Pais
        PaisFactory(codigo='DO')
        with pytest.raises(IntegrityError):
            Pais.objects.create(
                codigo='DO', nombre='Duplicado', moneda_codigo='DOP',
                moneda_simbolo='RD$',
            )


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


# =============================================================================
# ACTIVOS FIJOS
# =============================================================================

@pytest.mark.django_db
class TestCategoriaActivo:
    def test_create(self):
        cat = CategoriaActivoFactory()
        assert cat.nombre is not None
        assert cat.vida_util_default == 60
        assert cat.metodo_default == 'LINEAL'
        assert str(cat) == cat.nombre

    def test_unique_negocio_nombre(self):
        from api.models import CategoriaActivo
        cat = CategoriaActivoFactory(nombre='Mobiliario')
        with pytest.raises(IntegrityError):
            CategoriaActivo.objects.create(
                negocio=cat.negocio, nombre='Mobiliario',
                vida_util_default=120, metodo_default='LINEAL',
            )


@pytest.mark.django_db
class TestActivoFijo:
    def test_create_auto_codigo(self):
        activo = ActivoFijoFactory(codigo='')
        assert activo.codigo == 'AF-0001'
        assert str(activo) == f'AF-0001 - {activo.nombre}'

    def test_auto_codigo_sequential(self):
        a1 = ActivoFijoFactory(codigo='')
        a2 = ActivoFijoFactory(negocio=a1.negocio, codigo='',
                                categoria=a1.categoria,
                                cuenta_contable=a1.cuenta_contable,
                                cuenta_depreciacion=a1.cuenta_depreciacion,
                                cuenta_gasto=a1.cuenta_gasto)
        assert a1.codigo == 'AF-0001'
        assert a2.codigo == 'AF-0002'

    def test_base_depreciable(self):
        activo = ActivoFijoFactory(
            costo_adquisicion=Decimal('120000'),
            valor_residual=Decimal('12000'),
        )
        assert activo.base_depreciable == Decimal('108000')

    def test_depreciacion_mensual_lineal(self):
        activo = ActivoFijoFactory(
            costo_adquisicion=Decimal('120000'),
            valor_residual=Decimal('12000'),
            vida_util_meses=60,
        )
        # (120000 - 12000) / 60 = 1800
        assert activo.depreciacion_mensual_lineal == Decimal('1800')

    def test_valor_en_libros_sin_depreciacion(self):
        activo = ActivoFijoFactory(costo_adquisicion=Decimal('100000'))
        assert activo.valor_en_libros == Decimal('100000')

    def test_depreciacion_acumulada_sin_registros(self):
        activo = ActivoFijoFactory()
        assert activo.depreciacion_acumulada == Decimal('0')


# =============================================================================
# WORKFLOW DE APROBACIONES
# =============================================================================

@pytest.mark.django_db
class TestWorkflowConfig:
    def test_create(self):
        wf = WorkflowConfigFactory()
        assert wf.entidad == 'ORDEN_COMPRA'
        assert wf.activo is True
        assert str(wf) is not None

    def test_unique_negocio_entidad(self):
        from api.models import WorkflowConfig
        wf = WorkflowConfigFactory(entidad='COMPRA')
        with pytest.raises(IntegrityError):
            WorkflowConfig.objects.create(
                negocio=wf.negocio, nombre='Otro', entidad='COMPRA',
            )


@pytest.mark.django_db
class TestWorkflowStep:
    def test_create(self):
        step = WorkflowStepFactory()
        assert step.rol_aprobador == 'GERENTE'
        assert step.timeout_horas == 48

    def test_unique_workflow_orden(self):
        from api.models import WorkflowStep
        step = WorkflowStepFactory(orden=1)
        with pytest.raises(IntegrityError):
            WorkflowStep.objects.create(
                workflow=step.workflow, orden=1, nombre='Dup',
                rol_aprobador='GERENTE',
            )


@pytest.mark.django_db
class TestApprovalEngine:
    def test_submit_creates_solicitud(self):
        from api.approval_engine import ApprovalEngine
        from api.models import OrdenCompra

        negocio = NegocioFactory()
        wf = WorkflowConfigFactory(negocio=negocio, entidad='ORDEN_COMPRA')
        step = WorkflowStepFactory(workflow=wf, orden=1)
        solicitante = UsuarioFactory(negocio=negocio, rol='VENDEDOR')

        # Create an OrdenCompra to attach
        proveedor = ProveedorFactory(negocio=negocio)
        from api.models import Almacen
        almacen = Almacen.objects.create(
            negocio=negocio,
            sucursal=solicitante.sucursal,
            nombre='Principal', codigo='ALM001',
            es_principal=True,
        )
        oc = OrdenCompra.objects.create(
            negocio=negocio, proveedor=proveedor,
            numero='OC-001',             almacen=almacen,
            subtotal=Decimal('5000'), total_impuestos=Decimal('900'),
            total=Decimal('5900'),
        )

        engine = ApprovalEngine()
        solicitud = engine.submit(wf, oc, solicitante, Decimal('5900'))

        assert solicitud is not None
        assert solicitud.estado == 'PENDIENTE'
        assert solicitud.paso_actual == step
        assert solicitud.monto == Decimal('5900')

    def test_approve_single_step(self):
        from api.approval_engine import ApprovalEngine
        from api.models import OrdenCompra, Almacen

        negocio = NegocioFactory()
        wf = WorkflowConfigFactory(negocio=negocio, entidad='ORDEN_COMPRA')
        step = WorkflowStepFactory(workflow=wf, orden=1, rol_aprobador='GERENTE')
        solicitante = UsuarioFactory(negocio=negocio, rol='VENDEDOR')
        aprobador = UsuarioFactory(negocio=negocio, rol='GERENTE')

        proveedor = ProveedorFactory(negocio=negocio)
        almacen = Almacen.objects.create(
            negocio=negocio, sucursal=solicitante.sucursal,
            nombre='ALM', codigo='A01', es_principal=True,
        )
        oc = OrdenCompra.objects.create(
            negocio=negocio, proveedor=proveedor, numero='OC-002',
            almacen=almacen,
            subtotal=5000, total_impuestos=900, total=5900,
        )

        engine = ApprovalEngine()
        solicitud = engine.submit(wf, oc, solicitante, Decimal('5900'))
        solicitud = engine.decide(solicitud, aprobador, 'APROBADA', 'Aprobado')
        assert solicitud.estado == 'APROBADA'

    def test_reject(self):
        from api.approval_engine import ApprovalEngine
        from api.models import OrdenCompra, Almacen

        negocio = NegocioFactory()
        wf = WorkflowConfigFactory(negocio=negocio, entidad='ORDEN_COMPRA')
        WorkflowStepFactory(workflow=wf, orden=1, rol_aprobador='GERENTE')
        solicitante = UsuarioFactory(negocio=negocio, rol='VENDEDOR')
        aprobador = UsuarioFactory(negocio=negocio, rol='GERENTE')

        proveedor = ProveedorFactory(negocio=negocio)
        almacen = Almacen.objects.create(
            negocio=negocio, sucursal=solicitante.sucursal,
            nombre='ALM', codigo='A02', es_principal=True,
        )
        oc = OrdenCompra.objects.create(
            negocio=negocio, proveedor=proveedor, numero='OC-003',
            almacen=almacen,
            subtotal=5000, total_impuestos=900, total=5900,
        )

        engine = ApprovalEngine()
        solicitud = engine.submit(wf, oc, solicitante, Decimal('5900'))
        solicitud = engine.decide(solicitud, aprobador, 'RECHAZADA', 'No procede')
        assert solicitud.estado == 'RECHAZADA'

    def test_multi_step_approval(self):
        from api.approval_engine import ApprovalEngine
        from api.models import OrdenCompra, Almacen

        negocio = NegocioFactory()
        wf = WorkflowConfigFactory(negocio=negocio, entidad='ORDEN_COMPRA')
        step1 = WorkflowStepFactory(workflow=wf, orden=1, rol_aprobador='GERENTE')
        step2 = WorkflowStepFactory(workflow=wf, orden=2, rol_aprobador='ADMIN_NEGOCIO')
        solicitante = UsuarioFactory(negocio=negocio, rol='VENDEDOR')
        gerente = UsuarioFactory(negocio=negocio, rol='GERENTE')
        admin = UsuarioFactory(negocio=negocio, rol='ADMIN_NEGOCIO')

        proveedor = ProveedorFactory(negocio=negocio)
        almacen = Almacen.objects.create(
            negocio=negocio, sucursal=solicitante.sucursal,
            nombre='ALM', codigo='A03', es_principal=True,
        )
        oc = OrdenCompra.objects.create(
            negocio=negocio, proveedor=proveedor, numero='OC-004',
            almacen=almacen,
            subtotal=50000, total_impuestos=9000, total=59000,
        )

        engine = ApprovalEngine()
        solicitud = engine.submit(wf, oc, solicitante, Decimal('59000'))
        assert solicitud.paso_actual == step1

        solicitud = engine.decide(solicitud, gerente, 'APROBADA', 'OK')
        assert solicitud.estado == 'PENDIENTE'
        assert solicitud.paso_actual == step2

        solicitud = engine.decide(solicitud, admin, 'APROBADA', 'OK final')
        assert solicitud.estado == 'APROBADA'

    def test_auto_approve_low_amount(self):
        from api.approval_engine import ApprovalEngine
        from api.models import OrdenCompra, Almacen

        negocio = NegocioFactory()
        wf = WorkflowConfigFactory(negocio=negocio, entidad='ORDEN_COMPRA')
        WorkflowStepFactory(
            workflow=wf, orden=1, rol_aprobador='GERENTE',
            auto_aprobar_bajo_monto=Decimal('1000'),
        )
        solicitante = UsuarioFactory(negocio=negocio, rol='VENDEDOR')

        proveedor = ProveedorFactory(negocio=negocio)
        almacen = Almacen.objects.create(
            negocio=negocio, sucursal=solicitante.sucursal,
            nombre='ALM', codigo='A04', es_principal=True,
        )
        oc = OrdenCompra.objects.create(
            negocio=negocio, proveedor=proveedor, numero='OC-005',
            almacen=almacen,
            subtotal=500, total_impuestos=90, total=590,
        )

        engine = ApprovalEngine()
        solicitud = engine.submit(wf, oc, solicitante, Decimal('590'))
        assert solicitud.estado == 'APROBADA'


# =============================================================================
# PRESUPUESTOS
# =============================================================================

@pytest.mark.django_db
class TestPresupuesto:
    def test_create(self):
        presupuesto = PresupuestoFactory()
        assert presupuesto.estado == 'BORRADOR'
        assert presupuesto.nombre.startswith('Presupuesto')

    def test_total_presupuestado(self):
        presupuesto = PresupuestoFactory()
        LineaPresupuestoFactory(presupuesto=presupuesto)
        assert presupuesto.total_presupuestado == Decimal('12000.00')

    def test_linea_auto_total(self):
        linea = LineaPresupuestoFactory(
            mes_01=Decimal('500'), mes_02=Decimal('600'),
            mes_03=Decimal('0'), mes_04=Decimal('0'),
            mes_05=Decimal('0'), mes_06=Decimal('0'),
            mes_07=Decimal('0'), mes_08=Decimal('0'),
            mes_09=Decimal('0'), mes_10=Decimal('0'),
            mes_11=Decimal('0'), mes_12=Decimal('0'),
        )
        assert linea.total_anual == Decimal('1100')


# =============================================================================
# CONCILIACIÓN BANCARIA
# =============================================================================

@pytest.mark.django_db
class TestTransaccionBancaria:
    def test_create(self):
        txn = TransaccionBancariaFactory()
        assert txn.estado == 'PENDIENTE'
        assert txn.monto == Decimal('5000.00')

    def test_importacion_link(self):
        txn = TransaccionBancariaFactory()
        assert txn.importacion is not None
        assert txn.importacion.formato == 'OFX'


@pytest.mark.django_db
class TestConciliationEngine:
    def test_exact_match(self):
        from api.conciliation_engine import ConciliationEngine
        from api.models import MovimientoBancario

        negocio = NegocioFactory()
        cuenta = CuentaBancariaFactory(negocio=negocio)
        importacion = ArchivoImportacionBancariaFactory(
            negocio=negocio, cuenta_bancaria=cuenta,
        )

        # Create an internal movement
        mov = MovimientoBancario.objects.create(
            cuenta=cuenta, tipo='CREDITO',
            fecha=importacion.fecha_importacion.date(),
            monto=Decimal('5000.00'),
            referencia='REF-001',
            descripcion='Deposito cliente',
            conciliado=False,
        )

        # Create a matching bank transaction
        txn = TransaccionBancariaFactory(
            negocio=negocio,
            cuenta_bancaria=cuenta,
            importacion=importacion,
            fecha=mov.fecha,
            monto=Decimal('5000.00'),
            referencia='REF-001',
        )

        engine = ConciliationEngine()
        stats = engine.auto_match(importacion)
        txn.refresh_from_db()

        assert txn.estado == 'CONCILIADA'
        assert txn.movimiento_match == mov
        assert stats['matched'] >= 1


# =============================================================================
# CIRCUIT BREAKERS
# =============================================================================

class TestCircuitBreakers:
    def test_get_all_status(self):
        from api.circuit_breakers import get_all_status
        status = get_all_status()
        assert 'dgii' in status
        assert 'claude' in status
        assert 'external' in status
        assert status['dgii']['state'] == 'closed'

    def test_reset_breaker(self):
        from api.circuit_breakers import reset_breaker, dgii_breaker
        # Open the breaker by simulating failures
        for _ in range(6):
            try:
                @dgii_breaker
                def failing():
                    raise Exception('fail')
                failing()
            except Exception:
                pass
        assert reset_breaker('dgii') is True
        assert dgii_breaker.current_state == 'closed'

    def test_reset_unknown(self):
        from api.circuit_breakers import reset_breaker
        assert reset_breaker('nonexistent') is False


# =============================================================================
# PARSERS
# =============================================================================

class TestOFXParser:
    def test_validate_ofx(self):
        from api.parsers.ofx_parser import OFXParser
        parser = OFXParser()
        assert parser.validate(b'OFXHEADER:100\n<OFX>...') is True
        assert parser.validate(b'not an ofx file') is False


class TestCSVParser:
    def test_parse_basic_csv(self):
        from api.parsers.csv_parser import CSVBankParser
        csv_content = """fecha,descripcion,monto,referencia
01/01/2024,Deposito cliente,5000.00,REF001
02/01/2024,Pago proveedor,-3000.00,REF002
"""
        parser = CSVBankParser()
        txns = parser.parse(csv_content)
        assert len(txns) == 2
        assert txns[0].monto == Decimal('5000.00')
        assert txns[1].monto == Decimal('-3000.00')
        assert txns[0].referencia == 'REF001'

    def test_validate_csv(self):
        from api.parsers.csv_parser import CSVBankParser
        parser = CSVBankParser()
        assert parser.validate('a,b,c\n1,2,3') is True


class TestMT940Parser:
    def test_validate_mt940(self):
        from api.parsers.mt940_parser import MT940Parser
        parser = MT940Parser()
        assert parser.validate(':20:STARTOFSTMT\n:60F:...') is True
        assert parser.validate('not mt940') is False
