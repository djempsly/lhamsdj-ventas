import logging
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from .models import Venta, Producto, FacturaElectronica, AuditLog

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
