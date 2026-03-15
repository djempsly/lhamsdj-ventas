from celery import shared_task
import logging

logger = logging.getLogger('api')


# =============================================================================
# FISCAL TASKS (existing)
# =============================================================================

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def enviar_ecf_async(self, venta_id):
    """Envia e-CF a DGII en background."""
    from api.models import Venta, FacturaElectronica
    from api.utils.ecf_generator import ECFGenerator
    from api.utils.xml_signer import sign_ecf_xml
    from api.utils.dgii_api import DGIIClient

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

        FacturaElectronica.objects.update_or_create(
            venta=venta,
            defaults={
                'track_id': resultado.get('trackId', ''),
                'xml_firmado': xml_firmado,
                'respuesta_dgii': resultado,
                'qr_code_url': (
                    f"https://dgii.gov.do/ecf?rnc={negocio.identificacion_fiscal}"
                    f"&encf={venta.ncf}&sc={venta.codigo_seguridad_dgii}"
                ),
            }
        )

        if resultado.get('estado') == 'ACEPTADO':
            venta.estado_fiscal = 'ACEPTADO'
        elif resultado.get('estado') == 'RECHAZADO':
            venta.estado_fiscal = 'RECHAZADO'
        else:
            venta.estado_fiscal = 'ENVIADO'
        venta.save(update_fields=['estado_fiscal'])

        logger.info('e-CF enviado para venta %s: %s', venta.numero, resultado.get('estado'))
        return {'status': 'ok', 'track_id': resultado.get('trackId')}

    except Exception as exc:
        logger.error('Error enviando e-CF para venta %s: %s', venta_id, exc)
        try:
            Venta.objects.filter(id=venta_id).update(estado_fiscal='EN_CONTINGENCIA')
        except Exception:
            pass
        raise self.retry(exc=exc)


@shared_task
def reintentar_ecf_contingencia():
    """Reintenta envio de e-CF en contingencia."""
    from api.models import Venta

    ventas = Venta.objects.filter(
        estado_fiscal='EN_CONTINGENCIA'
    ).values_list('id', flat=True)[:20]
    for venta_id in ventas:
        enviar_ecf_async.delay(str(venta_id))

    logger.info('Reintentando %d e-CF en contingencia', len(ventas))


# =============================================================================
# AI TASKS (existing)
# =============================================================================

@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def generar_analisis_ai_async(self, negocio_id, tipo, dias=30):
    """Genera analisis AI en background."""
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

        logger.info('Analisis AI tipo %s generado para negocio %s', tipo, negocio.nombre_comercial)
        return {'status': 'ok', 'tipo': tipo}

    except Exception as exc:
        logger.error('Error generando analisis AI: %s', exc)
        raise self.retry(exc=exc)


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


# =============================================================================
# SECURITY TASKS
# =============================================================================

@shared_task
def backup_diario():
    """Backup automatico diario de la base de datos."""
    from api.security.backup_manager import create_database_backup
    try:
        result = create_database_backup(tipo='DIARIO')
        logger.info('Backup diario completado: %s', result.get('archivo'))
        return result
    except Exception as exc:
        logger.error('Error en backup diario: %s', exc)
        raise


@shared_task
def limpiar_sesiones_expiradas():
    """Limpiar sesiones inactivas (>7 dias sin uso)."""
    from api.models import SesionActiva
    from django.utils import timezone
    from datetime import timedelta

    cutoff = timezone.now() - timedelta(days=7)
    count = SesionActiva.objects.filter(
        ultimo_uso__lt=cutoff
    ).update(activa=False)

    if count:
        logger.info('Limpiadas %d sesiones expiradas', count)
    return {'cleaned': count}


@shared_task
def detectar_anomalias_todos():
    """Detectar anomalias en todos los negocios activos."""
    from api.models import Negocio, AlertaSeguridad
    from api.security.anomaly_detector import run_daily_anomaly_scan

    negocios = Negocio.objects.filter(estado_licencia='ACTIVA')
    total_alerts = 0

    for negocio in negocios:
        try:
            alerts = run_daily_anomaly_scan(negocio)
            for alert_data in alerts:
                AlertaSeguridad.objects.create(
                    negocio=negocio,
                    tipo=alert_data.get('tipo', 'ANOMALIA'),
                    severidad='ALTA',
                    titulo=alert_data.get('tipo', 'Anomalia detectada'),
                    descripcion=alert_data.get('descripcion', ''),
                    datos=alert_data,
                )
                total_alerts += 1
        except Exception as e:
            logger.error('Error detectando anomalias para %s: %s', negocio.nombre_comercial, e)

    logger.info('Deteccion de anomalias completada: %d alertas generadas', total_alerts)
    return {'alerts': total_alerts}


@shared_task
def verificar_licencias():
    """Verificar validez de todas las licencias activas."""
    from api.models import LicenciaSistema, Negocio
    from api.security.license_manager import verify_license
    from django.utils import timezone

    licencias = LicenciaSistema.objects.filter(activa=True)
    expired = 0

    for licencia in licencias:
        is_valid, reason = verify_license(licencia)
        licencia.ultima_verificacion = timezone.now()

        if not is_valid:
            licencia.activa = False
            expired += 1
            logger.warning(
                'Licencia invalidada para negocio %s: %s',
                licencia.negocio_id, reason
            )

        licencia.save(update_fields=['ultima_verificacion', 'activa'])

    logger.info('Verificacion de licencias: %d expiradas de %d', expired, licencias.count())
    return {'total': licencias.count(), 'expired': expired}


@shared_task
def limpiar_backups_expirados():
    """Eliminar backups que exceden la retencion de 30 dias."""
    from api.security.backup_manager import cleanup_expired_backups
    count = cleanup_expired_backups()
    return {'cleaned': count}


@shared_task
def limpiar_ips_expiradas():
    """Limpiar IPs bloqueadas cuyo tiempo de bloqueo ya paso."""
    from api.models import IPBloqueada
    from django.utils import timezone

    count = IPBloqueada.objects.filter(
        permanente=False,
        bloqueado_hasta__lt=timezone.now(),
    ).delete()[0]

    if count:
        logger.info('Limpiadas %d IPs bloqueadas expiradas', count)
    return {'cleaned': count}


# =============================================================================
# DEPRECIATION TASKS
# =============================================================================

@shared_task
def calcular_depreciacion_mensual(negocio_id=None, mes=None):
    """
    Calculate monthly depreciation for all active fixed assets.
    Called by Celery beat on the 1st of each month.
    """
    from api.models import (
        Negocio, ActivoFijo, PeriodoContable, DepreciacionMensual,
        AsientoContable, LineaAsiento,
    )
    from django.db import transaction
    from datetime import date

    if mes:
        year, month = mes.split('-')
        year, month = int(year), int(month)
    else:
        today = timezone.now().date()
        # Depreciate the previous month
        if today.month == 1:
            year, month = today.year - 1, 12
        else:
            year, month = today.year, today.month - 1

    fecha_ref = date(year, month, 1)
    negocios = Negocio.objects.filter(estado_licencia='ACTIVA')
    if negocio_id:
        negocios = negocios.filter(id=negocio_id)

    total = 0
    for negocio in negocios:
        periodo = PeriodoContable.objects.filter(
            negocio=negocio, estado='ABIERTO',
            fecha_inicio__lte=fecha_ref, fecha_fin__gte=fecha_ref,
        ).first()
        if not periodo:
            continue

        activos = ActivoFijo.objects.filter(
            negocio=negocio, estado='ACTIVO',
        ).exclude(depreciaciones__periodo=periodo)

        for activo in activos:
            dep_acum = activo.depreciacion_acumulada
            base = activo.base_depreciable
            if dep_acum >= base:
                activo.estado = 'DEPRECIADO_TOTAL'
                activo.save(update_fields=['estado'])
                continue

            monto = activo.depreciacion_mensual_lineal
            if dep_acum + monto > base:
                monto = base - dep_acum

            nueva_acum = dep_acum + monto
            valor_libros = activo.costo_adquisicion - nueva_acum

            try:
                with transaction.atomic():
                    asiento = AsientoContable.objects.create(
                        negocio=negocio, periodo=periodo,
                        fecha=periodo.fecha_fin, tipo='AUTOMATICO',
                        descripcion=f'Depreciación {activo.codigo} - {year}-{month:02d}',
                        estado='APROBADO',
                        total_debe=monto, total_haber=monto,
                    )
                    LineaAsiento.objects.create(
                        asiento=asiento, cuenta=activo.cuenta_gasto,
                        descripcion=f'Gasto depreciación {activo.codigo}',
                        debe=monto, haber=0,
                    )
                    LineaAsiento.objects.create(
                        asiento=asiento, cuenta=activo.cuenta_depreciacion,
                        descripcion=f'Depreciación acumulada {activo.codigo}',
                        debe=0, haber=monto,
                    )
                    DepreciacionMensual.objects.create(
                        activo=activo, periodo=periodo,
                        fecha=periodo.fecha_fin,
                        monto_depreciacion=monto,
                        depreciacion_acumulada=nueva_acum,
                        valor_en_libros=valor_libros,
                        asiento_contable=asiento,
                    )
                    if nueva_acum >= base:
                        activo.estado = 'DEPRECIADO_TOTAL'
                        activo.save(update_fields=['estado'])
                    total += 1
            except Exception as e:
                logger.error('Error depreciando %s: %s', activo.codigo, e)

    logger.info('Depreciación mensual completada: %d activos procesados', total)
    return {'processed': total}


# =============================================================================
# APPROVAL WORKFLOW TASKS
# =============================================================================

@shared_task
def escalar_aprobaciones_timeout():
    """Escalate approval requests that have exceeded their timeout."""
    from api.approval_engine import ApprovalEngine

    engine = ApprovalEngine()
    escalated = engine.escalate_timeouts()
    logger.info('Escalated %d approval solicitudes', escalated)
    return {'escalated': escalated}


# =============================================================================
# BANK RECONCILIATION TASKS
# =============================================================================

@shared_task
def conciliar_automatico_async(importacion_id):
    """Run auto-matching on a bank import file asynchronously."""
    from api.models import ArchivoImportacionBancaria
    from api.conciliation_engine import ConciliationEngine

    try:
        importacion = ArchivoImportacionBancaria.objects.get(id=importacion_id)
        engine = ConciliationEngine()
        stats = engine.auto_match(importacion)
        logger.info('Auto-conciliation for %s: %s', importacion_id, stats)
        return stats
    except ArchivoImportacionBancaria.DoesNotExist:
        logger.error('Import file %s not found', importacion_id)
        return {'error': 'not_found'}
    except Exception as e:
        logger.error('Error in auto-conciliation: %s', e)
        return {'error': str(e)}
