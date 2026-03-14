"""
Backup management - automated daily backups, encrypted with AES-256.
RPO: 24 hours, RTO: 4 hours, Retention: 30 days.
"""
import hashlib
import logging
import os
import subprocess
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger('security')

BACKUP_DIR = os.getenv('BACKUP_DIR', '/var/backups/sistema-ventas')
RETENTION_DAYS = 30


def _ensure_backup_dir():
    """Ensure backup directory exists."""
    os.makedirs(BACKUP_DIR, exist_ok=True)


def compute_file_sha256(filepath: str) -> str:
    """Compute SHA-256 checksum of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def create_database_backup(tipo: str = 'DIARIO') -> dict:
    """
    Create an encrypted database backup.
    Returns backup metadata dict.
    """
    from api.models import BackupRegistro

    _ensure_backup_dir()

    timestamp = timezone.now().strftime('%Y%m%d_%H%M%S')
    dump_file = os.path.join(BACKUP_DIR, f'db_backup_{timestamp}.sql')
    encrypted_file = f'{dump_file}.enc'

    db_config = settings.DATABASES['default']

    try:
        # Create database dump
        env = os.environ.copy()
        if db_config.get('PASSWORD'):
            env['PGPASSWORD'] = db_config['PASSWORD']

        cmd = [
            'pg_dump',
            '-h', db_config.get('HOST', 'localhost'),
            '-p', str(db_config.get('PORT', '5432')),
            '-U', db_config.get('USER', 'postgres'),
            '-Fc',  # Custom format (compressed)
            '-f', dump_file,
            db_config['NAME'],
        ]

        subprocess.run(cmd, env=env, check=True, capture_output=True, timeout=600)

        # Encrypt with openssl AES-256
        aes_key = os.getenv('AES_256_KEY', '')
        if aes_key:
            encrypt_cmd = [
                'openssl', 'enc', '-aes-256-cbc',
                '-salt', '-pbkdf2',
                '-in', dump_file,
                '-out', encrypted_file,
                '-pass', f'pass:{aes_key}',
            ]
            subprocess.run(encrypt_cmd, check=True, capture_output=True, timeout=300)
            os.remove(dump_file)
            final_file = encrypted_file
            is_encrypted = True
        else:
            final_file = dump_file
            is_encrypted = False
            logger.warning('Backup not encrypted - AES_256_KEY not set')

        file_size = os.path.getsize(final_file)
        checksum = compute_file_sha256(final_file)

        registro = BackupRegistro.objects.create(
            tipo=tipo,
            archivo=final_file,
            tamano_bytes=file_size,
            checksum_sha256=checksum,
            encriptado=is_encrypted,
            estado='COMPLETADO',
            expira_en=timezone.now() + timedelta(days=RETENTION_DAYS),
        )

        logger.info(
            'Backup created: %s (size=%d, encrypted=%s)',
            final_file, file_size, is_encrypted
        )

        return {
            'id': str(registro.id),
            'archivo': final_file,
            'tamano': file_size,
            'checksum': checksum,
            'encriptado': is_encrypted,
        }

    except subprocess.CalledProcessError as e:
        logger.error('Backup failed: %s', e.stderr)
        BackupRegistro.objects.create(
            tipo=tipo,
            archivo=dump_file,
            estado='FALLIDO',
            expira_en=timezone.now() + timedelta(days=RETENTION_DAYS),
        )
        raise
    except Exception as e:
        logger.error('Backup error: %s', e)
        raise


def cleanup_expired_backups() -> int:
    """Remove backups older than retention period."""
    from api.models import BackupRegistro

    expired = BackupRegistro.objects.filter(expira_en__lt=timezone.now())
    count = 0

    for backup in expired:
        try:
            if os.path.exists(backup.archivo):
                os.remove(backup.archivo)
            backup.delete()
            count += 1
        except Exception as e:
            logger.error('Error cleaning backup %s: %s', backup.archivo, e)

    if count:
        logger.info('Cleaned up %d expired backups', count)
    return count


def verify_backup(backup_id: str) -> tuple[bool, str]:
    """Verify backup integrity by checking SHA-256 checksum."""
    from api.models import BackupRegistro

    try:
        backup = BackupRegistro.objects.get(id=backup_id)
    except BackupRegistro.DoesNotExist:
        return False, 'Backup no encontrado'

    if not os.path.exists(backup.archivo):
        return False, 'Archivo de backup no encontrado'

    actual_checksum = compute_file_sha256(backup.archivo)
    if actual_checksum != backup.checksum_sha256:
        return False, f'Checksum no coincide (esperado={backup.checksum_sha256[:16]}...)'

    backup.estado = 'VERIFICADO'
    backup.test_restauracion = timezone.now()
    backup.save(update_fields=['estado', 'test_restauracion'])

    return True, 'Backup verificado exitosamente'
