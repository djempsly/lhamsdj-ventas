"""
Anomaly detection for financial transactions.
Detects unusual sales, excessive discounts, frequent voids, and more.
"""
import logging
from datetime import timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Sum, Q
from django.utils import timezone

logger = logging.getLogger('security')

# Thresholds
DISCOUNT_LIMITS = {
    'CAJERO': Decimal('10.00'),
    'VENDEDOR': Decimal('10.00'),
    'GERENTE': Decimal('30.00'),
    'ADMIN_NEGOCIO': Decimal('30.00'),
    'CONTADOR': Decimal('0.00'),
    'ALMACEN': Decimal('0.00'),
    'AUDITOR': Decimal('0.00'),
    'SUPER_ADMIN': Decimal('100.00'),
}

VOID_ALERT_THRESHOLD_PERCENT = Decimal('5.0')  # Alert if voids > 5% of daily sales
CASH_DISCREPANCY_THRESHOLD = Decimal('1.0')  # Alert if cash discrepancy > 1%
HIGH_VALUE_THRESHOLD = Decimal('1000.00')  # Double confirmation threshold


def get_max_discount_for_role(rol: str) -> Decimal:
    """Get maximum discount percentage allowed for a role."""
    return DISCOUNT_LIMITS.get(rol, Decimal('0.00'))


def validate_discount(user, discount_percent: Decimal) -> tuple[bool, str]:
    """Validate if user is allowed to apply this discount."""
    max_allowed = get_max_discount_for_role(user.rol)
    if discount_percent > max_allowed:
        return False, (
            f"Descuento {discount_percent}% excede el limite de {max_allowed}% "
            f"para el rol {user.get_rol_display()}"
        )
    return True, ''


def requires_double_confirmation(monto: Decimal) -> bool:
    """Check if a transaction requires double confirmation."""
    return monto > HIGH_VALUE_THRESHOLD


def detect_unusual_sales(negocio, user=None, hours: int = 24) -> list[dict]:
    """Detect unusual sales patterns."""
    from api.models import Venta

    since = timezone.now() - timedelta(hours=hours)
    alerts = []

    # Get average sale amount for this business
    avg_data = Venta.objects.filter(
        negocio=negocio,
        estado='COMPLETADA',
        fecha__gte=timezone.now() - timedelta(days=30),
    ).aggregate(avg_total=Avg('total'), count=Count('id'))

    avg_total = avg_data['avg_total'] or Decimal('0')

    if avg_total > 0:
        # Find sales > 3x the average
        unusual = Venta.objects.filter(
            negocio=negocio,
            estado='COMPLETADA',
            fecha__gte=since,
            total__gt=avg_total * 3,
        )
        if user:
            unusual = unusual.filter(cajero=user)

        for venta in unusual[:10]:
            alerts.append({
                'tipo': 'VENTA_INUSUAL',
                'descripcion': f'Venta {venta.numero} por ${venta.total} (promedio: ${avg_total:.2f})',
                'monto': str(venta.total),
                'venta_id': str(venta.id),
            })

    return alerts


def detect_excessive_voids(negocio, fecha=None) -> list[dict]:
    """Detect excessive void/cancellation rate."""
    from api.models import Venta

    if fecha is None:
        fecha = timezone.now().date()

    total_ventas = Venta.objects.filter(
        negocio=negocio,
        fecha__date=fecha,
    ).count()

    anuladas = Venta.objects.filter(
        negocio=negocio,
        fecha__date=fecha,
        estado='ANULADA',
    ).count()

    alerts = []
    if total_ventas > 0:
        void_rate = Decimal(anuladas) / Decimal(total_ventas) * 100
        if void_rate > VOID_ALERT_THRESHOLD_PERCENT:
            alerts.append({
                'tipo': 'ANULACIONES_EXCESIVAS',
                'descripcion': (
                    f'{anuladas} anulaciones de {total_ventas} ventas '
                    f'({void_rate:.1f}%) - Umbral: {VOID_ALERT_THRESHOLD_PERCENT}%'
                ),
                'tasa': str(void_rate),
            })

    return alerts


def detect_excessive_discounts(negocio, fecha=None) -> list[dict]:
    """Detect excessive discounts applied."""
    from api.models import Venta

    if fecha is None:
        fecha = timezone.now().date()

    ventas = Venta.objects.filter(
        negocio=negocio,
        fecha__date=fecha,
        estado='COMPLETADA',
    ).aggregate(
        total_ventas=Sum('total'),
        total_descuento=Sum('descuento'),
    )

    alerts = []
    total = ventas['total_ventas'] or Decimal('0')
    descuento = ventas['total_descuento'] or Decimal('0')

    if total > 0:
        discount_rate = descuento / total * 100
        if discount_rate > Decimal('15'):
            alerts.append({
                'tipo': 'DESCUENTO_EXCESIVO',
                'descripcion': (
                    f'Descuentos totales: ${descuento} de ${total} '
                    f'({discount_rate:.1f}%) - Alerta por exceso'
                ),
                'tasa': str(discount_rate),
            })

    return alerts


def detect_cash_discrepancy(cuadre) -> list[dict]:
    """Detect significant cash discrepancy in cash closing."""
    alerts = []
    if cuadre.efectivo_esperado and cuadre.efectivo_esperado > 0:
        discrepancy_rate = abs(cuadre.diferencia) / cuadre.efectivo_esperado * 100
        if discrepancy_rate > CASH_DISCREPANCY_THRESHOLD:
            alerts.append({
                'tipo': 'DESCUADRE',
                'descripcion': (
                    f'Descuadre de ${cuadre.diferencia} '
                    f'({discrepancy_rate:.1f}%) en caja de {cuadre.cajero}'
                ),
                'monto': str(cuadre.diferencia),
                'tasa': str(discrepancy_rate),
            })

    return alerts


def validate_server_side_price(producto, precio_enviado: Decimal) -> tuple[bool, str]:
    """Validate that the price sent matches the server-side price (anti-MITM)."""
    if precio_enviado != producto.precio_venta and precio_enviado != producto.precio_mayorista:
        # Allow if user has price edit permission (checked separately)
        return False, (
            f'Precio enviado ${precio_enviado} no coincide con precio '
            f'del producto ${producto.precio_venta}'
        )
    return True, ''


def run_daily_anomaly_scan(negocio) -> list[dict]:
    """Run all anomaly detection checks for a business."""
    all_alerts = []
    all_alerts.extend(detect_unusual_sales(negocio))
    all_alerts.extend(detect_excessive_voids(negocio))
    all_alerts.extend(detect_excessive_discounts(negocio))
    return all_alerts
