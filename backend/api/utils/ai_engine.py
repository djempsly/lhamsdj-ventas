import logging
import json
from decimal import Decimal
from django.conf import settings
from django.db.models import Sum, Count, Avg, F
from django.utils import timezone
from datetime import timedelta

logger = logging.getLogger('audit')


class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return float(o)
        return super().default(o)


def _get_client():
    """Obtiene el cliente de Anthropic."""
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', None)
    if not api_key:
        raise ValueError('ANTHROPIC_API_KEY no configurada en settings.')
    try:
        import anthropic
        return anthropic.Anthropic(api_key=api_key)
    except ImportError:
        raise ImportError('El paquete anthropic no está instalado. Ejecute: pip install anthropic')


def _call_claude(prompt, system_prompt=None):
    """Llama a la API de Claude y retorna el texto de respuesta."""
    client = _get_client()
    messages = [{'role': 'user', 'content': prompt}]
    kwargs = {
        'model': 'claude-sonnet-4-20250514',
        'max_tokens': 2048,
        'messages': messages,
    }
    if system_prompt:
        kwargs['system'] = system_prompt

    response = client.messages.create(**kwargs)
    return response.content[0].text


def analizar_ventas(negocio, dias=30):
    """
    Analiza las ventas de un negocio en un período.
    Retorna insights y recomendaciones.
    """
    from ..models import Venta, DetalleVenta, AnalisisAI

    fecha_inicio = timezone.now() - timedelta(days=dias)
    ventas = Venta.objects.filter(
        negocio=negocio,
        estado='COMPLETADA',
        fecha__gte=fecha_inicio,
    )

    resumen = ventas.aggregate(
        total_ventas=Sum('total'),
        total_ganancia=Sum('ganancia'),
        cantidad=Count('id'),
        ticket_promedio=Avg('total'),
    )

    # Top productos
    top_productos = (
        DetalleVenta.objects
        .filter(venta__negocio=negocio, venta__estado='COMPLETADA', venta__fecha__gte=fecha_inicio)
        .values('producto__nombre')
        .annotate(
            cantidad_vendida=Sum('cantidad'),
            total_vendido=Sum('total'),
        )
        .order_by('-total_vendido')[:10]
    )

    # Ventas por día de semana
    ventas_por_dia = (
        ventas
        .values('fecha__week_day')
        .annotate(total=Sum('total'), cantidad=Count('id'))
        .order_by('fecha__week_day')
    )

    datos = {
        'resumen': {k: float(v) if v else 0 for k, v in resumen.items()},
        'top_productos': list(top_productos),
        'ventas_por_dia': list(ventas_por_dia),
    }

    prompt = f"""Analiza los siguientes datos de ventas de un negocio en República Dominicana
durante los últimos {dias} días y proporciona insights accionables en español:

{json.dumps(datos, cls=DecimalEncoder, indent=2)}

Proporciona:
1. Resumen ejecutivo (2-3 oraciones)
2. Top 3 insights más importantes
3. Top 3 recomendaciones accionables
4. Tendencias identificadas

Responde en formato estructurado."""

    system_prompt = (
        "Eres un analista de negocios experto en retail y ventas en República Dominicana. "
        "Responde siempre en español dominicano profesional."
    )

    try:
        respuesta = _call_claude(prompt, system_prompt)

        analisis = AnalisisAI.objects.create(
            negocio=negocio,
            tipo='INSIGHT',
            titulo=f'Análisis de Ventas - Últimos {dias} días',
            descripcion=respuesta,
            datos=datos,
            confianza=Decimal('85.00'),
            accionable=True,
        )
        return analisis
    except Exception as e:
        logger.error('Error en análisis AI de ventas: %s', e)
        return AnalisisAI.objects.create(
            negocio=negocio,
            tipo='INSIGHT',
            titulo=f'Análisis de Ventas - Últimos {dias} días',
            descripcion=f'Error generando análisis: {e}',
            datos=datos,
            confianza=Decimal('0'),
            accionable=False,
        )


def detectar_anomalias(negocio):
    """Detecta patrones inusuales en ventas recientes."""
    from ..models import Venta, AnalisisAI

    fecha_inicio = timezone.now() - timedelta(days=7)
    ventas_recientes = Venta.objects.filter(
        negocio=negocio,
        estado='COMPLETADA',
        fecha__gte=fecha_inicio,
    )

    # Estadísticas para detectar anomalías
    stats = ventas_recientes.aggregate(
        promedio_total=Avg('total'),
        max_total=Sum('total'),
        cantidad=Count('id'),
    )

    # Ventas con montos inusualmente altos (> 3x promedio)
    promedio = stats['promedio_total'] or Decimal('0')
    anomalias_monto = list(
        ventas_recientes
        .filter(total__gt=promedio * 3)
        .values('numero', 'total', 'fecha', 'cajero__username')[:10]
    )

    # Ventas anuladas recientes
    anuladas = Venta.objects.filter(
        negocio=negocio,
        estado='ANULADA',
        fecha__gte=fecha_inicio,
    ).count()

    datos = {
        'promedio_venta': float(promedio),
        'total_ventas': stats['cantidad'] or 0,
        'anomalias_monto': anomalias_monto,
        'ventas_anuladas': anuladas,
    }

    prompt = f"""Analiza los siguientes datos de ventas recientes y detecta anomalías:

{json.dumps(datos, cls=DecimalEncoder, indent=2, default=str)}

Identifica:
1. Patrones inusuales en montos
2. Posibles problemas de fraude o errores
3. Nivel de riesgo (BAJO/MEDIO/ALTO)
4. Acciones recomendadas

Responde en español."""

    try:
        respuesta = _call_claude(prompt)
        return AnalisisAI.objects.create(
            negocio=negocio,
            tipo='ANOMALIA',
            titulo='Detección de Anomalías - Últimos 7 días',
            descripcion=respuesta,
            datos=datos,
            confianza=Decimal('75.00'),
            accionable=bool(anomalias_monto or anuladas > 5),
        )
    except Exception as e:
        logger.error('Error en detección de anomalías: %s', e)
        return AnalisisAI.objects.create(
            negocio=negocio,
            tipo='ANOMALIA',
            titulo='Detección de Anomalías',
            descripcion=f'Error: {e}',
            datos=datos,
            confianza=Decimal('0'),
            accionable=False,
        )


def generar_recomendaciones(negocio):
    """Genera recomendaciones de inventario y productos."""
    from ..models import Producto, DetalleVenta, AnalisisAI

    # Productos con stock bajo
    stock_bajo = list(
        Producto.objects
        .filter(negocio=negocio, activo=True, stock_actual__lte=F('stock_minimo'))
        .values('nombre', 'stock_actual', 'stock_minimo')[:10]
    )

    # Productos más vendidos últimos 30 días
    fecha_inicio = timezone.now() - timedelta(days=30)
    top_vendidos = list(
        DetalleVenta.objects
        .filter(venta__negocio=negocio, venta__estado='COMPLETADA', venta__fecha__gte=fecha_inicio)
        .values('producto__nombre')
        .annotate(cantidad=Sum('cantidad'), ingreso=Sum('total'))
        .order_by('-ingreso')[:10]
    )

    # Productos sin ventas últimos 30 días
    productos_vendidos_ids = (
        DetalleVenta.objects
        .filter(venta__negocio=negocio, venta__estado='COMPLETADA', venta__fecha__gte=fecha_inicio)
        .values_list('producto_id', flat=True)
    )
    sin_ventas = list(
        Producto.objects
        .filter(negocio=negocio, activo=True)
        .exclude(id__in=productos_vendidos_ids)
        .values('nombre', 'stock_actual', 'precio_venta')[:10]
    )

    datos = {
        'stock_bajo': stock_bajo,
        'top_vendidos': top_vendidos,
        'sin_ventas_30_dias': sin_ventas,
    }

    prompt = f"""Basándote en los datos de inventario de un negocio dominicano:

{json.dumps(datos, cls=DecimalEncoder, indent=2, default=str)}

Genera recomendaciones sobre:
1. Productos que necesitan reabastecimiento urgente
2. Oportunidades de promoción para productos sin movimiento
3. Productos estrella que deben mantenerse siempre en stock
4. Sugerencias generales de gestión de inventario

Responde en español con formato claro."""

    try:
        respuesta = _call_claude(prompt)
        return AnalisisAI.objects.create(
            negocio=negocio,
            tipo='RECOMENDACION',
            titulo='Recomendaciones de Inventario',
            descripcion=respuesta,
            datos=datos,
            confianza=Decimal('80.00'),
            accionable=True,
        )
    except Exception as e:
        logger.error('Error generando recomendaciones: %s', e)
        return AnalisisAI.objects.create(
            negocio=negocio,
            tipo='RECOMENDACION',
            titulo='Recomendaciones de Inventario',
            descripcion=f'Error: {e}',
            datos=datos,
            confianza=Decimal('0'),
            accionable=False,
        )
