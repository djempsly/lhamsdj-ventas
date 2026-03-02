import logging
from cryptography.fernet import Fernet
from django.conf import settings

logger = logging.getLogger('security')


def _get_fernet():
    key = getattr(settings, 'FISCAL_ENCRYPTION_KEY', None)
    if not key:
        raise ValueError(
            "FISCAL_ENCRYPTION_KEY no configurada en settings. "
            "Genera una con: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_value(plain_text):
    """Encripta un valor de texto plano usando Fernet."""
    if not plain_text:
        return ''
    f = _get_fernet()
    return f.encrypt(plain_text.encode()).decode()


def decrypt_value(encrypted_text):
    """Desencripta un valor encriptado con Fernet."""
    if not encrypted_text:
        return ''
    try:
        f = _get_fernet()
        return f.decrypt(encrypted_text.encode()).decode()
    except Exception as e:
        logger.error('Error desencriptando valor: %s', e)
        return ''
