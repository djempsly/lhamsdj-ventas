import logging
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger('audit')


def obtener_siguiente_ncf(negocio, tipo_comprobante):
    """
    Obtiene el siguiente NCF disponible para un tipo de comprobante.
    Usa select_for_update() para manejar concurrencia.

    Args:
        negocio: Instancia de Negocio
        tipo_comprobante: str — 'B01', 'B02', 'B04', 'B14', 'B15', etc.

    Returns:
        str: NCF formateado (ej: 'E310000000001')

    Raises:
        ValueError: Si no hay secuencia disponible o está agotada.
    """
    from ..models import SecuenciaNCF

    # Mapeo tipo comprobante a código e-CF
    tipo_ecf_map = {
        'B01': '31',  # Crédito Fiscal
        'B02': '32',  # Consumo
        'B03': '33',  # Nota de Débito
        'B04': '34',  # Nota de Crédito
        'B11': '41',  # Compras
        'B13': '43',  # Gastos Menores
        'B14': '44',  # Regímenes Especiales
        'B15': '45',  # Gubernamental
    }

    with transaction.atomic():
        secuencia = (
            SecuenciaNCF.objects
            .select_for_update()
            .filter(
                negocio=negocio,
                tipo_comprobante=tipo_comprobante,
                activa=True,
                fecha_vencimiento__gte=timezone.now().date(),
            )
            .first()
        )

        if not secuencia:
            raise ValueError(
                f'No hay secuencia NCF activa y vigente para tipo {tipo_comprobante} '
                f'en negocio {negocio.nombre_comercial}.'
            )

        if secuencia.numero_actual > secuencia.numero_hasta:
            secuencia.activa = False
            secuencia.save(update_fields=['activa'])
            raise ValueError(
                f'Secuencia NCF agotada para tipo {tipo_comprobante}. '
                f'Rango: {secuencia.numero_desde}-{secuencia.numero_hasta}.'
            )

        numero = secuencia.numero_actual
        secuencia.numero_actual += 1
        secuencia.save(update_fields=['numero_actual'])

    tipo_ecf = tipo_ecf_map.get(tipo_comprobante, '32')
    ncf = f"E{tipo_ecf}{secuencia.serie}{numero:08d}"

    logger.info(
        'NCF asignado: %s (tipo: %s, negocio: %s)',
        ncf, tipo_comprobante, negocio.id,
    )
    return ncf
