import logging
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from django.utils import timezone as tz_utils
from .models import (
    Venta, Compra, Producto, FacturaElectronica, AuditLog,
    Usuario, CuadreCaja, AlertaSeguridad,
)

logger = logging.getLogger('audit')


@receiver(pre_save, sender=Venta)
def audit_venta_update(sender, instance, **kwargs):
    """Log changes to existing sales."""
    if not instance.pk:
        return
    try:
        old = Venta.objects.get(pk=instance.pk)
    except Venta.DoesNotExist:
        return

    changes = {}
    for field in ('estado', 'estado_fiscal', 'total', 'descuento', 'tipo_pago'):
        old_val = getattr(old, field)
        new_val = getattr(instance, field)
        if str(old_val) != str(new_val):
            changes[field] = {'old': str(old_val), 'new': str(new_val)}

    if changes and instance.negocio_id:
        AuditLog.objects.create(
            negocio_id=instance.negocio_id,
            usuario=instance.cajero,
            accion='UPDATE',
            modelo='Venta',
            objeto_id=str(instance.pk),
            descripcion=f'Venta {instance.numero} modificada',
            datos_anteriores=changes,
        )

    # Auto-create accounting entry when sale is completed
    if (changes.get('estado') and
            changes['estado']['new'] == 'COMPLETADA' and
            changes['estado']['old'] != 'COMPLETADA'):
        try:
            from .utils.contabilidad import crear_asiento_venta
            crear_asiento_venta(instance)
        except Exception as e:
            logger.error('Error creando asiento para venta %s: %s', instance.numero, e)


@receiver(post_save, sender=Venta)
def audit_venta_create(sender, instance, created, **kwargs):
    """Log new sales."""
    if created and instance.negocio_id:
        AuditLog.objects.create(
            negocio_id=instance.negocio_id,
            usuario=instance.cajero,
            accion='CREATE',
            modelo='Venta',
            objeto_id=str(instance.pk),
            descripcion=f'Venta {instance.numero} creada - Total: {instance.total}',
            datos_nuevos={'total': str(instance.total), 'ncf': instance.ncf},
        )

        # If created directly as COMPLETADA, create accounting entry
        if instance.estado == 'COMPLETADA':
            try:
                from .utils.contabilidad import crear_asiento_venta
                if not instance.asiento:
                    crear_asiento_venta(instance)
            except Exception as e:
                logger.error('Error creando asiento para venta nueva %s: %s', instance.numero, e)

        # Check if transaction requires double confirmation
        try:
            negocio = instance.negocio
            umbral = negocio.umbral_confirmacion
            if instance.total and instance.total >= umbral:
                from datetime import timedelta
                from django.utils import timezone
                from .models import ConfirmacionTransaccion
                ConfirmacionTransaccion.objects.create(
                    negocio=negocio,
                    tipo='VENTA',
                    objeto_id=str(instance.pk),
                    monto=instance.total,
                    solicitado_por=instance.cajero,
                    expira_en=timezone.now() + timedelta(hours=24),
                )
                AlertaSeguridad.objects.create(
                    negocio=negocio,
                    tipo='TRANSACCION_ALTA',
                    severidad='MEDIA',
                    titulo=f'Transaccion alta: ${instance.total}',
                    descripcion=(
                        f'Venta {instance.numero} por ${instance.total} '
                        f'requiere doble confirmacion (umbral: ${umbral})'
                    ),
                    usuario=instance.cajero,
                    datos={'venta_id': str(instance.pk), 'total': str(instance.total)},
                )
        except Exception as e:
            logger.error('Error checking double confirmation: %s', e)


@receiver(post_save, sender=FacturaElectronica)
def audit_ecf_create(sender, instance, created, **kwargs):
    """Log electronic invoice creation."""
    if created:
        venta = instance.venta
        if venta.negocio_id:
            AuditLog.objects.create(
                negocio_id=venta.negocio_id,
                usuario=venta.cajero,
                accion='CREATE',
                modelo='FacturaElectronica',
                objeto_id=str(instance.pk),
                descripcion=f'e-CF emitido para venta {venta.numero} - Track: {instance.track_id}',
                datos_nuevos={'track_id': instance.track_id, 'ecf_tipo': instance.ecf_tipo},
            )


@receiver(pre_save, sender=Producto)
def audit_producto_price_change(sender, instance, **kwargs):
    """Log product price changes for audit compliance."""
    if not instance.pk:
        return
    try:
        old = Producto.objects.get(pk=instance.pk)
    except Producto.DoesNotExist:
        return

    changes = {}
    for field in ('precio_costo', 'precio_venta', 'precio_mayorista', 'activo'):
        old_val = getattr(old, field)
        new_val = getattr(instance, field)
        if str(old_val) != str(new_val):
            changes[field] = {'old': str(old_val), 'new': str(new_val)}

    if changes and instance.negocio_id:
        AuditLog.objects.create(
            negocio_id=instance.negocio_id,
            usuario=None,
            accion='UPDATE',
            modelo='Producto',
            objeto_id=str(instance.pk),
            descripcion=f'Producto {instance.nombre} modificado',
            datos_anteriores=changes,
        )


@receiver(pre_save, sender=Compra)
def auto_asiento_compra(sender, instance, **kwargs):
    """Auto-create accounting entry when purchase is received."""
    if not instance.pk:
        return
    try:
        old = Compra.objects.get(pk=instance.pk)
    except Compra.DoesNotExist:
        return

    if old.estado != 'RECIBIDA' and instance.estado == 'RECIBIDA':
        try:
            from .utils.contabilidad import crear_asiento_compra
            crear_asiento_compra(instance)
        except Exception as e:
            logger.error('Error creando asiento para compra %s: %s', instance.numero, e)


# =============================================================================
# SECURITY SIGNALS
# =============================================================================

@receiver(pre_save, sender=Usuario)
def detect_role_change(sender, instance, **kwargs):
    """Alert on role changes, especially to admin roles."""
    if not instance.pk:
        return
    try:
        old = Usuario.objects.get(pk=instance.pk)
    except Usuario.DoesNotExist:
        return

    if old.rol != instance.rol and instance.negocio_id:
        AuditLog.objects.create(
            negocio_id=instance.negocio_id,
            usuario=None,
            accion='ROLE_CHANGE',
            modelo='Usuario',
            objeto_id=str(instance.pk),
            descripcion=f'Rol cambiado de {old.rol} a {instance.rol} para {instance.username}',
            datos_anteriores={'rol': old.rol},
            datos_nuevos={'rol': instance.rol},
        )

        # Alert on promotion to admin roles
        admin_roles = ('SUPER_ADMIN', 'ADMIN_NEGOCIO')
        if instance.rol in admin_roles and old.rol not in admin_roles:
            AlertaSeguridad.objects.create(
                negocio_id=instance.negocio_id,
                tipo='CAMBIO_ROL',
                severidad='ALTA',
                titulo=f'Nuevo administrador: {instance.username}',
                descripcion=f'Rol cambiado de {old.rol} a {instance.rol}',
                usuario=instance,
                datos={
                    'rol_anterior': old.rol,
                    'rol_nuevo': instance.rol,
                    'usuario_id': str(instance.pk),
                },
            )


@receiver(post_save, sender=CuadreCaja)
def detect_cash_discrepancy(sender, instance, created, **kwargs):
    """Detect and alert on cash discrepancies > 1%."""
    if not created:
        return
    if not instance.negocio_id:
        return

    negocio_id = instance.negocio_id
    if hasattr(instance, 'cajero') and instance.cajero and instance.cajero.negocio_id:
        negocio_id = instance.cajero.negocio_id

    from api.security.anomaly_detector import detect_cash_discrepancy
    alerts = detect_cash_discrepancy(instance)
    for alert in alerts:
        AlertaSeguridad.objects.create(
            negocio_id=negocio_id,
            tipo='DESCUADRE',
            severidad='ALTA',
            titulo=f'Descuadre de caja: ${instance.diferencia}',
            descripcion=alert['descripcion'],
            datos=alert,
        )


# =============================================================================
# DASHBOARD CACHE INVALIDATION
# =============================================================================

@receiver([post_save, post_delete], sender=Venta)
def invalidate_dashboard_cache(sender, instance, **kwargs):
    hoy = tz_utils.now().date()
    cache_key = f'dashboard:{instance.negocio_id}:{hoy}'
    cache.delete(cache_key)
