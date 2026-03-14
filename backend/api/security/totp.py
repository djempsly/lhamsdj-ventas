"""
TOTP/2FA - Google Authenticator compatible MFA implementation.
Includes encrypted secret storage, anti-replay protection, and backup codes.
"""
import hashlib
import logging
import secrets
import io
import base64
import time

import pyotp
import qrcode

logger = logging.getLogger('security')


def generate_totp_secret() -> str:
    """Generate a new TOTP secret for a user."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, username: str, issuer: str = 'SistemaVentas') -> str:
    """Generate provisioning URI for QR code scanning."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=issuer)


def generate_qr_code_base64(uri: str) -> str:
    """Generate QR code as base64 encoded PNG image."""
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode()


def _encrypt_secret(secret: str) -> str:
    """Encrypt TOTP secret using AES-256-GCM before storage."""
    if not secret:
        return ''
    try:
        from api.security.data_protection import encrypt_aes256
        return encrypt_aes256(secret)
    except Exception as e:
        logger.error('Failed to encrypt TOTP secret: %s', e)
        return secret


def _decrypt_secret(encrypted: str) -> str:
    """Decrypt TOTP secret from storage."""
    if not encrypted:
        return ''
    # If it doesn't contain ':', it's a legacy plaintext secret
    if ':' not in encrypted:
        return encrypted
    try:
        from api.security.data_protection import decrypt_aes256
        return decrypt_aes256(encrypted)
    except Exception as e:
        logger.error('Failed to decrypt TOTP secret: %s', e)
        return ''


def verify_totp(secret_encrypted: str, token: str) -> bool:
    """Verify a TOTP token with anti-replay protection.

    Uses cache to track the last used counter value,
    rejecting any code with a counter <= the previously used one.
    """
    if not secret_encrypted or not token:
        return False

    secret = _decrypt_secret(secret_encrypted)
    if not secret:
        return False

    totp = pyotp.TOTP(secret)
    current_counter = int(time.time()) // 30

    # Check valid_window manually for anti-replay
    for offset in range(-1, 2):  # -1, 0, +1 window
        counter = current_counter + offset
        expected = totp.at(counter * 30)
        if expected == token:
            # Anti-replay: check if this counter was already used
            from django.core.cache import cache
            replay_key = f'totp_replay:{secret_encrypted[:20]}'
            last_used = cache.get(replay_key, -1)

            if counter <= last_used:
                logger.warning('TOTP replay detected (counter %d <= %d)', counter, last_used)
                return False

            # Mark this counter as used (TTL 90s covers the 3-window span)
            cache.set(replay_key, counter, timeout=90)
            return True

    return False


def generate_backup_codes(count: int = 8) -> list[str]:
    """Generate plaintext backup codes. Returns list of 8-char hex codes."""
    return [secrets.token_hex(4).upper() for _ in range(count)]


def hash_backup_code(code: str) -> str:
    """Hash a backup code with SHA-256 for storage."""
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def verify_backup_code(code: str, hashed_codes: list[str]) -> int | None:
    """Verify a backup code against stored hashes.
    Returns the index of the matching code (for deletion), or None.
    """
    code_hash = hash_backup_code(code)
    for i, stored_hash in enumerate(hashed_codes):
        if stored_hash == code_hash:
            return i
    return None


def setup_2fa(user) -> dict:
    """Setup 2FA for a user, returning secret, QR code, and backup codes."""
    secret = generate_totp_secret()
    uri = get_totp_uri(secret, user.username)
    qr_base64 = generate_qr_code_base64(uri)

    # Encrypt secret before storing
    encrypted_secret = _encrypt_secret(secret)
    user.two_factor_secret = encrypted_secret
    user.save(update_fields=['two_factor_secret'])

    # Generate and store hashed backup codes
    backup_codes = generate_backup_codes(8)
    hashed_codes = [hash_backup_code(c) for c in backup_codes]
    user.backup_codes = hashed_codes
    user.save(update_fields=['backup_codes'])

    logger.info('2FA setup initiated for user %s', user.username)

    return {
        'secret': secret,
        'qr_code': f'data:image/png;base64,{qr_base64}',
        'uri': uri,
        'backup_codes': backup_codes,  # Shown ONCE to user
    }


def confirm_2fa(user, token: str) -> bool:
    """Confirm 2FA setup by verifying the first token."""
    if not user.two_factor_secret:
        return False

    secret = _decrypt_secret(user.two_factor_secret)
    if not secret:
        return False

    totp = pyotp.TOTP(secret)
    if totp.verify(token, valid_window=1):
        user.two_factor_enabled = True
        user.save(update_fields=['two_factor_enabled'])
        logger.info('2FA enabled for user %s', user.username)
        return True

    return False


def disable_2fa(user) -> None:
    """Disable 2FA for a user."""
    user.two_factor_enabled = False
    user.two_factor_secret = ''
    user.backup_codes = []
    user.save(update_fields=['two_factor_enabled', 'two_factor_secret', 'backup_codes'])
    logger.info('2FA disabled for user %s', user.username)
