import logging
from datetime import datetime, timezone
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.backends import default_backend

logger = logging.getLogger('security')


def validate_p12_certificate(p12_path, p12_password):
    """
    Valida un certificado .p12 y retorna información de estado.

    Returns:
        dict con: valid, subject, issuer, not_before, not_after, days_remaining, error
    """
    result = {
        'valid': False,
        'subject': '',
        'issuer': '',
        'not_before': None,
        'not_after': None,
        'days_remaining': 0,
        'error': None,
    }

    try:
        with open(p12_path, 'rb') as f:
            p12_data = f.read()

        private_key, cert, chain = pkcs12.load_key_and_certificates(
            p12_data,
            p12_password.encode() if isinstance(p12_password, str) else p12_password,
            backend=default_backend(),
        )

        if cert is None:
            result['error'] = 'El archivo .p12 no contiene un certificado válido.'
            return result

        now = datetime.now(timezone.utc)
        not_before = cert.not_valid_before_utc
        not_after = cert.not_valid_after_utc

        subject_parts = []
        for attr in cert.subject:
            subject_parts.append(f"{attr.oid._name}={attr.value}")
        issuer_parts = []
        for attr in cert.issuer:
            issuer_parts.append(f"{attr.oid._name}={attr.value}")

        result['subject'] = ', '.join(subject_parts)
        result['issuer'] = ', '.join(issuer_parts)
        result['not_before'] = not_before.isoformat()
        result['not_after'] = not_after.isoformat()
        result['days_remaining'] = (not_after - now).days

        if now < not_before:
            result['error'] = 'El certificado aún no es válido.'
        elif now > not_after:
            result['error'] = 'El certificado ha expirado.'
        else:
            result['valid'] = True

    except FileNotFoundError:
        result['error'] = f'Archivo de certificado no encontrado: {p12_path}'
    except ValueError as e:
        result['error'] = f'Contraseña incorrecta o certificado corrupto: {e}'
    except Exception as e:
        logger.error('Error validando certificado %s: %s', p12_path, e)
        result['error'] = f'Error inesperado validando certificado: {e}'

    return result
