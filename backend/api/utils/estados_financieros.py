from decimal import Decimal
from django.db.models import Sum, Q
from ..models import CuentaContable, LineaAsiento


def generar_balance_general(negocio, fecha):
    """
    Genera un Balance General a una fecha determinada.

    Agrupa CuentaContable por tipo (ACTIVO, PASIVO, PATRIMONIO)
    y suma saldos de todas las cuentas activas.

    Returns:
        dict con estructura jerárquica: activos, pasivos, patrimonio, totales
    """
    cuentas = CuentaContable.objects.filter(
        negocio=negocio,
        activa=True,
        es_cuenta_detalle=True,
    )

    # Calcular saldos reales desde movimientos contabilizados
    def _saldo_cuenta(cuenta):
        movimientos = LineaAsiento.objects.filter(
            cuenta=cuenta,
            asiento__estado='CONTABILIZADO',
            asiento__fecha__lte=fecha,
        ).aggregate(
            total_debe=Sum('debe'),
            total_haber=Sum('haber'),
        )
        debe = movimientos['total_debe'] or Decimal('0')
        haber = movimientos['total_haber'] or Decimal('0')
        if cuenta.naturaleza == 'DEUDORA':
            return debe - haber
        return haber - debe

    activos = []
    pasivos = []
    patrimonio = []
    total_activos = Decimal('0')
    total_pasivos = Decimal('0')
    total_patrimonio = Decimal('0')

    for cuenta in cuentas:
        saldo = _saldo_cuenta(cuenta)
        item = {
            'codigo': cuenta.codigo,
            'nombre': cuenta.nombre,
            'tipo': cuenta.tipo,
            'saldo': float(saldo),
        }
        if cuenta.tipo == 'ACTIVO':
            activos.append(item)
            total_activos += saldo
        elif cuenta.tipo == 'PASIVO':
            pasivos.append(item)
            total_pasivos += saldo
        elif cuenta.tipo == 'PATRIMONIO':
            patrimonio.append(item)
            total_patrimonio += saldo

    return {
        'fecha': str(fecha),
        'activos': {
            'cuentas': activos,
            'total': float(total_activos),
        },
        'pasivos': {
            'cuentas': pasivos,
            'total': float(total_pasivos),
        },
        'patrimonio': {
            'cuentas': patrimonio,
            'total': float(total_patrimonio),
        },
        'balance_cuadrado': abs(total_activos - (total_pasivos + total_patrimonio)) < Decimal('0.01'),
        'total_activos': float(total_activos),
        'total_pasivos_patrimonio': float(total_pasivos + total_patrimonio),
    }


def generar_estado_resultados(negocio, fecha_desde, fecha_hasta):
    """
    Genera un Estado de Resultados para un período.

    Query CuentaContable de tipo INGRESO, COSTO y GASTO.
    Suma movimientos en el período.

    Returns:
        dict con: ingresos, costos, gastos, utilidad_bruta, utilidad_operativa, utilidad_neta
    """
    cuentas = CuentaContable.objects.filter(
        negocio=negocio,
        activa=True,
        es_cuenta_detalle=True,
        tipo__in=['INGRESO', 'COSTO', 'GASTO'],
    )

    def _movimientos_periodo(cuenta):
        movimientos = LineaAsiento.objects.filter(
            cuenta=cuenta,
            asiento__estado='CONTABILIZADO',
            asiento__fecha__gte=fecha_desde,
            asiento__fecha__lte=fecha_hasta,
        ).aggregate(
            total_debe=Sum('debe'),
            total_haber=Sum('haber'),
        )
        debe = movimientos['total_debe'] or Decimal('0')
        haber = movimientos['total_haber'] or Decimal('0')
        if cuenta.naturaleza == 'ACREEDORA':
            return haber - debe
        return debe - haber

    ingresos = []
    costos = []
    gastos = []
    total_ingresos = Decimal('0')
    total_costos = Decimal('0')
    total_gastos = Decimal('0')

    for cuenta in cuentas:
        monto = _movimientos_periodo(cuenta)
        item = {
            'codigo': cuenta.codigo,
            'nombre': cuenta.nombre,
            'tipo': cuenta.tipo,
            'monto': float(monto),
        }
        if cuenta.tipo == 'INGRESO':
            ingresos.append(item)
            total_ingresos += monto
        elif cuenta.tipo == 'COSTO':
            costos.append(item)
            total_costos += monto
        elif cuenta.tipo == 'GASTO':
            gastos.append(item)
            total_gastos += monto

    utilidad_bruta = total_ingresos - total_costos
    utilidad_operativa = utilidad_bruta - total_gastos

    return {
        'periodo': {
            'desde': str(fecha_desde),
            'hasta': str(fecha_hasta),
        },
        'ingresos': {
            'cuentas': ingresos,
            'total': float(total_ingresos),
        },
        'costos': {
            'cuentas': costos,
            'total': float(total_costos),
        },
        'gastos': {
            'cuentas': gastos,
            'total': float(total_gastos),
        },
        'utilidad_bruta': float(utilidad_bruta),
        'utilidad_operativa': float(utilidad_operativa),
        'utilidad_neta': float(utilidad_operativa),
    }
