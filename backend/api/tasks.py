from celery import shared_task
import logging

logger = logging.getLogger('api')


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def enviar_ecf_async(self, venta_id):
    """Envía e-CF a DGII en background."""
    from api.models import Venta, FacturaElectronica
    from api.utils.ecf_generator import ECFGenerator
    from api.utils.xml_signer import sign_ecf_xml
    from api.utils.dgii_api import DGIIClient
    import random
    import string

    try:
        venta = Venta.objects.select_related('negocio', 'cliente').get(id=venta_id)
        negocio = venta.negocio

        generator = ECFGenerator(venta)
        xml_sin_firma = generator.generar()
        xml_firmado = sign_ecf_xml(
            xml_sin_firma,
            negocio.certificado_digital_path,
            negocio.certificado_pass_env
        )

        cliente = DGIIClient(
            ambiente=negocio.ambiente_fiscal,
            rnc=negocio.identificacion_fiscal,
            usuario=negocio.api_fiscal_usuario,
            clave=negocio.api_fiscal_clave_decrypted,
        )
        resultado = cliente.enviar_ecf(xml_firmado)

        factura, _ = FacturaElectronica.objects.update_or_create(
            venta=venta,
            defaults={
                'track_id': resultado.get('trackId', ''),
                'xml_firmado': xml_firmado,
                'respuesta_dgii': resultado,
                'qr_code_url': f"https://dgii.gov.do/ecf?rnc={negocio.identificacion_fiscal}&encf={venta.ncf}&sc={venta.codigo_seguridad_dgii}",
            }
        )

        if resultado.get('estado') == 'ACEPTADO':
            venta.estado_fiscal = 'ACEPTADO'
        elif resultado.get('estado') == 'RECHAZADO':
            venta.estado_fiscal = 'RECHAZADO'
        else:
            venta.estado_fiscal = 'ENVIADO'
        venta.save(update_fields=['estado_fiscal'])

        logger.info('e-CF enviado exitosamente para venta %s: %s', venta.numero, resultado.get('estado'))
        return {'status': 'ok', 'track_id': resultado.get('trackId')}

    except Exception as exc:
        logger.error('Error enviando e-CF para venta %s: %s', venta_id, exc)
        try:
            Venta.objects.filter(id=venta_id).update(estado_fiscal='EN_CONTINGENCIA')
        except Exception:
            pass
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generar_analisis_ai_async(self, negocio_id, tipo, dias=30):
    """Genera análisis AI en background."""
    from api.models import Negocio
    from api.utils.ai_engine import analizar_ventas, detectar_anomalias, generar_recomendaciones

    try:
        negocio = Negocio.objects.get(id=negocio_id)

        if tipo == 'ANOMALIA':
            detectar_anomalias(negocio)
        elif tipo == 'RECOMENDACION':
            generar_recomendaciones(negocio)
        else:
            analizar_ventas(negocio, dias=dias)

        logger.info('Análisis AI tipo %s generado para negocio %s', tipo, negocio.nombre_comercial)
        return {'status': 'ok', 'tipo': tipo}

    except Exception as exc:
        logger.error('Error generando análisis AI: %s', exc)
        raise self.retry(exc=exc)


@shared_task
def reintentar_ecf_contingencia():
    """Tarea programada: reintenta envío de e-CF en contingencia."""
    from api.models import Venta

    ventas = Venta.objects.filter(estado_fiscal='EN_CONTINGENCIA').values_list('id', flat=True)[:20]
    for venta_id in ventas:
        enviar_ecf_async.delay(str(venta_id))

    logger.info('Reintentando %d e-CF en contingencia', len(ventas))


@shared_task
def generar_reporte_fiscal_async(negocio_id, year, month, tipo):
    """Genera reporte fiscal 606/607/608 en background."""
    from api.models import Negocio
    from api.fiscal.strategies.dgii import DGIIStrategy

    try:
        negocio = Negocio.objects.get(id=negocio_id)
        strategy = DGIIStrategy()

        if tipo == '606':
            return strategy.generar_reporte_compras(negocio, year, month)
        elif tipo == '607':
            return strategy.generar_reporte_ventas(negocio, year, month)
        elif tipo == '608':
            return strategy.generar_reporte_anulaciones(negocio, year, month)
    except Exception as exc:
        logger.error('Error generando reporte %s: %s', tipo, exc)
        raise


@shared_task
def exportar_reporte_excel_async(negocio_id, tipo_reporte, parametros):
    """Exporta reportes a Excel en background."""
    from api.models import Negocio
    from api.utils.exporters import exportar_a_excel

    try:
        negocio = Negocio.objects.get(id=negocio_id)
        filepath = exportar_a_excel(negocio, tipo_reporte, parametros)
        logger.info('Reporte Excel generado: %s', filepath)
        return {'filepath': filepath}
    except Exception as exc:
        logger.error('Error exportando reporte: %s', exc)
        raise
