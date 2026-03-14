"""
Data protection - AES-256 encryption, data masking, payment tokenization.
PCI DSS Level 4 compliant patterns.
"""
import hashlib
import hmac
import logging
import os
import re
import secrets

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger('security')

# AES-256 key from environment (32 bytes = 256 bits)
_AES_KEY = None


def _get_aes_key() -> bytes:
    """Get AES-256 encryption key from environment."""
    global _AES_KEY
    if _AES_KEY is None:
        key_hex = os.getenv('AES_256_KEY', '')
        if not key_hex:
            raise ValueError(
                "AES_256_KEY no configurada. "
                "Genera una con: python -c \"import os; print(os.urandom(32).hex())\""
            )
        _AES_KEY = bytes.fromhex(key_hex)
        if len(_AES_KEY) != 32:
            raise ValueError("AES_256_KEY debe ser de 32 bytes (64 caracteres hex)")
    return _AES_KEY


def encrypt_aes256(plaintext: str) -> str:
    """Encrypt plaintext using AES-256-GCM. Returns nonce:ciphertext as hex."""
    if not plaintext:
        return ''
    key = _get_aes_key()
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode('utf-8'), None)
    return f"{nonce.hex()}:{ciphertext.hex()}"


def decrypt_aes256(encrypted: str) -> str:
    """Decrypt AES-256-GCM encrypted data."""
    if not encrypted or ':' not in encrypted:
        return ''
    try:
        key = _get_aes_key()
        nonce_hex, ciphertext_hex = encrypted.split(':', 1)
        nonce = bytes.fromhex(nonce_hex)
        ciphertext = bytes.fromhex(ciphertext_hex)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode('utf-8')
    except Exception as e:
        logger.error('AES-256 decryption error: %s', e)
        return ''


# ============================================================================
# DATA MASKING - For logs and non-privileged views
# ============================================================================

SENSITIVE_PATTERNS = {
    'email': (r'[\w.+-]+@[\w-]+\.[\w.]+', lambda m: m.group(0)[:2] + '***@***'),
    'phone': (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', lambda m: '***-***-' + m.group(0)[-4:]),
    'rnc': (r'\b\d{9,11}\b', lambda m: '***' + m.group(0)[-4:]),
    'card': (r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', lambda m: '****-****-****-' + m.group(0)[-4:]),
}


def mask_sensitive_data(data: str) -> str:
    """Mask sensitive data in log strings."""
    if not data:
        return data
    result = data
    for _name, (pattern, replacer) in SENSITIVE_PATTERNS.items():
        result = re.sub(pattern, replacer, result)
    return result


def mask_pii(value: str, visible_chars: int = 4) -> str:
    """Mask PII keeping only last N characters visible."""
    if not value or len(value) <= visible_chars:
        return '***'
    return '*' * (len(value) - visible_chars) + value[-visible_chars:]


def truncate_card_number(card_number: str) -> str:
    """Store only last 4 digits of card number (PCI DSS)."""
    digits = re.sub(r'\D', '', card_number)
    if len(digits) < 4:
        return '****'
    return digits[-4:]


# ============================================================================
# PAYMENT TOKENIZATION
# ============================================================================

def generate_payment_token() -> str:
    """Generate a secure random payment token."""
    return f"tok_{secrets.token_urlsafe(32)}"


def hash_api_key(raw_key: str) -> str:
    """Hash an API key for storage using SHA-256."""
    return hashlib.sha256(raw_key.encode()).hexdigest()


def generate_api_key() -> tuple[str, str]:
    """Generate an API key. Returns (raw_key, key_prefix)."""
    raw_key = f"sv_{secrets.token_urlsafe(48)}"
    prefix = raw_key[:8]
    return raw_key, prefix


# ============================================================================
# INTEGRITY VERIFICATION
# ============================================================================

def compute_hmac_sha256(data: str, key: str = '') -> str:
    """Compute HMAC-SHA256 for data integrity."""
    if not key:
        from django.conf import settings
        key = settings.SECRET_KEY
    return hmac.new(
        key.encode('utf-8'),
        data.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()


def verify_hmac_sha256(data: str, signature: str, key: str = '') -> bool:
    """Verify HMAC-SHA256 signature."""
    expected = compute_hmac_sha256(data, key)
    return hmac.compare_digest(expected, signature)


def compute_sha256(data: str) -> str:
    """Compute SHA-256 hash for integrity checking."""
    return hashlib.sha256(data.encode('utf-8')).hexdigest()
