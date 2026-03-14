"""
HMAC-SHA256 license system for software protection.
"""
import hashlib
import hmac
import json
import logging
from datetime import date

from django.conf import settings

logger = logging.getLogger('security')


def _get_license_key() -> str:
    """Get license signing key."""
    return getattr(settings, 'LICENSE_SIGNING_KEY', settings.SECRET_KEY)


def generate_license(
    negocio_id: str,
    tipo: str,
    max_usuarios: int,
    max_sucursales: int,
    modulos: list[str],
    fecha_inicio: date,
    fecha_fin: date,
) -> tuple[str, str]:
    """
    Generate a signed license.
    Returns (license_key, hmac_signature).
    """
    license_data = {
        'negocio_id': str(negocio_id),
        'tipo': tipo,
        'max_usuarios': max_usuarios,
        'max_sucursales': max_sucursales,
        'modulos': sorted(modulos),
        'fecha_inicio': fecha_inicio.isoformat(),
        'fecha_fin': fecha_fin.isoformat(),
    }

    payload = json.dumps(license_data, sort_keys=True, separators=(',', ':'))
    key = _get_license_key()

    signature = hmac.new(
        key.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    # License key is hash of payload
    license_key = hashlib.sha256(
        f"{payload}:{signature}".encode('utf-8')
    ).hexdigest()[:40].upper()

    # Format as groups
    formatted_key = '-'.join(
        license_key[i:i + 8] for i in range(0, len(license_key), 8)
    )

    return formatted_key, signature


def verify_license(license_record) -> tuple[bool, str]:
    """
    Verify a license record is valid and not expired.
    Returns (is_valid, reason).
    """
    # Rebuild payload from stored data
    license_data = {
        'negocio_id': str(license_record.negocio_id),
        'tipo': license_record.tipo,
        'max_usuarios': license_record.max_usuarios,
        'max_sucursales': license_record.max_sucursales,
        'modulos': sorted(license_record.modulos),
        'fecha_inicio': license_record.fecha_inicio.isoformat(),
        'fecha_fin': license_record.fecha_fin.isoformat(),
    }

    payload = json.dumps(license_data, sort_keys=True, separators=(',', ':'))
    key = _get_license_key()

    expected_signature = hmac.new(
        key.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, license_record.firma_hmac):
        logger.warning('License signature mismatch for negocio %s', license_record.negocio_id)
        return False, 'Firma de licencia invalida'

    today = date.today()
    if today > license_record.fecha_fin:
        return False, 'Licencia expirada'

    if today < license_record.fecha_inicio:
        return False, 'Licencia aun no activa'

    return True, 'Licencia valida'


def check_license_limits(negocio) -> tuple[bool, str]:
    """Check if business is within license limits."""
    from api.models import LicenciaSistema, Usuario, Sucursal

    license_rec = LicenciaSistema.objects.filter(
        negocio=negocio, activa=True
    ).first()

    if not license_rec:
        return True, 'Sin licencia activa (modo libre)'

    is_valid, reason = verify_license(license_rec)
    if not is_valid:
        return False, reason

    # Check user count
    user_count = Usuario.objects.filter(negocio=negocio, is_active=True).count()
    if user_count > license_rec.max_usuarios:
        return False, f'Limite de usuarios excedido ({user_count}/{license_rec.max_usuarios})'

    # Check branch count
    branch_count = Sucursal.objects.filter(negocio=negocio, activa=True).count()
    if branch_count > license_rec.max_sucursales:
        return False, f'Limite de sucursales excedido ({branch_count}/{license_rec.max_sucursales})'

    return True, 'OK'
