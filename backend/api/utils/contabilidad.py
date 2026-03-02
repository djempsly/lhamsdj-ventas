import logging
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.conf import settings

logger = logging.getLogger('audit')

# Códigos de cuenta por defecto — pueden ser sobrescritos en settings
CUENTA_CAJA = getattr(settings, 'CUENTA_CAJA', '1.1.01.01')
CUENTA_BANCO = getattr(settings, 'CUENTA_BANCO', '1.1.02.01')
CUENTA_CXC = getattr(settings, 'CUENTA_CXC', '1.1.03.01')
CUENTA_INGRESOS_VENTAS = getattr(settings, 'CUENTA_INGRESOS_VENTAS', '4.1.01.01')
CUENTA_ITBIS_POR_PAGAR = getattr(settings, 'CUENTA_ITBIS_POR_PAGAR', '2.1.05.01')
CUENTA_DESCUENTO_VENTAS = getattr(settings, 'CUENTA_DESCUENTO_VENTAS', '4.1.02.01')
CUENTA_INVENTARIO = getattr(settings, 'CUENTA_INVENTARIO', '1.1.04.01')
CUENTA_CXP = getattr(settings, 'CUENTA_CXP', '2.1.01.01')
CUENTA_ITBIS_POR_COBRAR = getattr(settings, 'CUENTA_ITBIS_POR_COBRAR', '1.1.06.01')
CUENTA_GASTO = getattr(settings, 'CUENTA_GASTO', '6.1.01.01')


def _get_cuenta(negocio, codigo):
    """Busca una cuenta contable por código en el negocio."""
    from ..models import CuentaContable
    cuenta = CuentaContable.objects.filter(
        negocio=negocio, codigo=codigo, activa=True,
    ).first()
    if not cuenta:
        logger.warning(
            'Cuenta contable %s no encontrada en negocio %s',
            codigo, negocio.id,
        )
    return cuenta


def _get_periodo_abierto(negocio, fecha):
    """Busca un período contable abierto que contenga la fecha."""
    from ..models import PeriodoContable
    return PeriodoContable.objects.filter(
        negocio=negocio,
        estado='ABIERTO',
        fecha_inicio__lte=fecha,
        fecha_fin__gte=fecha,
    ).first()


def _next_asiento_numero(negocio):
    """Genera el siguiente número de asiento."""
    from ..models import AsientoContable
    last = (
        AsientoContable.objects
        .filter(negocio=negocio)
        .order_by('-numero')
        .values_list('numero', flat=True)
        .first()
    )
    if last:
        try:
            num = int(last.replace('AST-', ''))
            return f"AST-{num + 1:06d}"
        except (ValueError, AttributeError):
            pass
    return "AST-000001"


@transaction.atomic
def crear_asiento_venta(venta):
    """
    Crea un asiento contable automático para una venta completada.

    Débito: Caja/Banco/CxC (según tipo_pago) por total
    Crédito: Ingresos por Ventas por subtotal
    Crédito: ITBIS por Pagar por total_impuestos
    Si hay descuento: Débito Descuentos sobre Ventas
    """
    from ..models import AsientoContable, LineaAsiento

    negocio = venta.negocio
    fecha = venta.fecha.date() if hasattr(venta.fecha, 'date') else venta.fecha

    periodo = _get_periodo_abierto(negocio, fecha)
    if not periodo:
        logger.warning('No hay período contable abierto para venta %s', venta.numero)
        return None

    # Determinar cuenta de contrapartida según tipo de pago
    tipo_pago_cuenta = {
        'EFECTIVO': CUENTA_CAJA,
        'TARJETA': CUENTA_BANCO,
        'TRANSFERENCIA': CUENTA_BANCO,
        'CHEQUE': CUENTA_BANCO,
        'CREDITO': CUENTA_CXC,
        'MIXTO': CUENTA_CAJA,
    }
    codigo_cuenta_cobro = tipo_pago_cuenta.get(venta.tipo_pago, CUENTA_CAJA)

    cuenta_cobro = _get_cuenta(negocio, codigo_cuenta_cobro)
    cuenta_ingreso = _get_cuenta(negocio, CUENTA_INGRESOS_VENTAS)
    cuenta_itbis = _get_cuenta(negocio, CUENTA_ITBIS_POR_PAGAR)

    if not all([cuenta_cobro, cuenta_ingreso]):
        logger.error('Cuentas contables faltantes para asiento de venta %s', venta.numero)
        return None

    asiento = AsientoContable.objects.create(
        negocio=negocio,
        periodo=periodo,
        numero=_next_asiento_numero(negocio),
        fecha=fecha,
        tipo='VENTA',
        descripcion=f'Venta {venta.numero} - {venta.cliente.nombre if venta.cliente else "Consumidor Final"}',
        referencia=venta.numero,
    )

    # Débito: Caja/Banco por total
    LineaAsiento.objects.create(
        asiento=asiento,
        cuenta=cuenta_cobro,
        descripcion=f'Cobro venta {venta.numero}',
        debe=venta.total,
        haber=Decimal('0'),
    )

    # Crédito: Ingresos por Ventas por subtotal_con_descuento
    subtotal_neto = venta.subtotal - venta.descuento
    LineaAsiento.objects.create(
        asiento=asiento,
        cuenta=cuenta_ingreso,
        descripcion=f'Ingreso venta {venta.numero}',
        debe=Decimal('0'),
        haber=subtotal_neto,
    )

    # Crédito: ITBIS por Pagar
    if venta.total_impuestos > 0 and cuenta_itbis:
        LineaAsiento.objects.create(
            asiento=asiento,
            cuenta=cuenta_itbis,
            descripcion=f'ITBIS venta {venta.numero}',
            debe=Decimal('0'),
            haber=venta.total_impuestos,
        )

    # Contabilizar
    asiento.contabilizar()
    venta.asiento = asiento
    venta.save(update_fields=['asiento'])

    logger.info('Asiento %s creado para venta %s', asiento.numero, venta.numero)
    return asiento


@transaction.atomic
def crear_asiento_compra(compra):
    """
    Crea un asiento contable automático para una compra recibida.

    Débito: Inventario/Gasto por subtotal
    Débito: ITBIS por Cobrar por total_impuestos
    Crédito: Cuentas por Pagar/Caja por total
    Si hay retenciones: ajustar créditos
    """
    from ..models import AsientoContable, LineaAsiento

    negocio = compra.negocio
    fecha = compra.fecha

    periodo = _get_periodo_abierto(negocio, fecha)
    if not periodo:
        logger.warning('No hay período contable abierto para compra %s', compra.numero)
        return None

    cuenta_inventario = _get_cuenta(negocio, CUENTA_INVENTARIO)
    cuenta_itbis_cobrar = _get_cuenta(negocio, CUENTA_ITBIS_POR_COBRAR)

    # Determinar si se paga al contado o a crédito
    forma_pago = getattr(compra, 'forma_pago', 'CREDITO')
    if forma_pago in ('EFECTIVO',):
        cuenta_pago = _get_cuenta(negocio, CUENTA_CAJA)
    elif forma_pago in ('TRANSFERENCIA', 'CHEQUE', 'TARJETA'):
        cuenta_pago = _get_cuenta(negocio, CUENTA_BANCO)
    else:
        cuenta_pago = _get_cuenta(negocio, CUENTA_CXP)

    if not all([cuenta_inventario, cuenta_pago]):
        logger.error('Cuentas contables faltantes para asiento de compra %s', compra.numero)
        return None

    asiento = AsientoContable.objects.create(
        negocio=negocio,
        periodo=periodo,
        numero=_next_asiento_numero(negocio),
        fecha=fecha,
        tipo='COMPRA',
        descripcion=f'Compra {compra.numero} - {compra.proveedor.nombre}',
        referencia=compra.numero,
    )

    # Débito: Inventario por subtotal
    LineaAsiento.objects.create(
        asiento=asiento,
        cuenta=cuenta_inventario,
        descripcion=f'Compra inventario {compra.numero}',
        debe=compra.subtotal,
        haber=Decimal('0'),
    )

    # Débito: ITBIS por Cobrar
    if compra.total_impuestos > 0 and cuenta_itbis_cobrar:
        LineaAsiento.objects.create(
            asiento=asiento,
            cuenta=cuenta_itbis_cobrar,
            descripcion=f'ITBIS compra {compra.numero}',
            debe=compra.total_impuestos,
            haber=Decimal('0'),
        )

    # Crédito: CxP/Caja por total (menos retenciones si aplica)
    monto_pago = compra.total
    itbis_retenido = getattr(compra, 'itbis_retenido', None) or Decimal('0')
    retencion_renta = getattr(compra, 'retencion_renta', None) or Decimal('0')
    monto_pago -= (itbis_retenido + retencion_renta)

    LineaAsiento.objects.create(
        asiento=asiento,
        cuenta=cuenta_pago,
        descripcion=f'Pago compra {compra.numero}',
        debe=Decimal('0'),
        haber=monto_pago,
    )

    # Si hay retenciones, se acreditan a cuentas de retención
    if itbis_retenido > 0:
        cuenta_itbis_pagar = _get_cuenta(negocio, CUENTA_ITBIS_POR_PAGAR)
        if cuenta_itbis_pagar:
            LineaAsiento.objects.create(
                asiento=asiento,
                cuenta=cuenta_itbis_pagar,
                descripcion=f'ITBIS retenido compra {compra.numero}',
                debe=Decimal('0'),
                haber=itbis_retenido,
            )

    if retencion_renta > 0:
        cuenta_itbis_pagar = _get_cuenta(negocio, CUENTA_ITBIS_POR_PAGAR)
        if cuenta_itbis_pagar:
            LineaAsiento.objects.create(
                asiento=asiento,
                cuenta=cuenta_itbis_pagar,
                descripcion=f'ISR retenido compra {compra.numero}',
                debe=Decimal('0'),
                haber=retencion_renta,
            )

    asiento.contabilizar()
    compra.asiento = asiento
    compra.save(update_fields=['asiento'])

    logger.info('Asiento %s creado para compra %s', asiento.numero, compra.numero)
    return asiento
