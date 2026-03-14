"""
Session management - concurrent session control and remote logout.
Max 3 sessions per user. Single-use refresh tokens.
"""
import logging
from django.utils import timezone

logger = logging.getLogger('security')

MAX_CONCURRENT_SESSIONS = 3


def register_session(user, token_jti: str, ip_address: str = '', user_agent: str = '') -> None:
    """Register a new session, removing oldest if limit exceeded."""
    from api.models import SesionActiva

    # Deactivate excess sessions (keep only MAX - 1 to make room for new one)
    active_sessions = SesionActiva.objects.filter(
        usuario=user, activa=True
    ).order_by('-creado_en')

    excess = active_sessions[MAX_CONCURRENT_SESSIONS - 1:]
    if excess:
        excess_ids = [s.id for s in excess]
        SesionActiva.objects.filter(id__in=excess_ids).update(activa=False)
        logger.info(
            'Deactivated %d excess sessions for user %s',
            len(excess_ids), user.username
        )

    SesionActiva.objects.create(
        usuario=user,
        token_jti=token_jti,
        ip_address=ip_address or None,
        user_agent=user_agent[:500],
    )


def is_session_valid(token_jti: str) -> bool:
    """Check if a session is still active."""
    from api.models import SesionActiva
    return SesionActiva.objects.filter(
        token_jti=token_jti, activa=True
    ).exists()


def invalidate_session(token_jti: str) -> None:
    """Invalidate a specific session."""
    from api.models import SesionActiva
    SesionActiva.objects.filter(token_jti=token_jti).update(activa=False)


def invalidate_all_sessions(user, exclude_jti: str = '') -> int:
    """Invalidate all sessions for a user (remote logout)."""
    from api.models import SesionActiva
    qs = SesionActiva.objects.filter(usuario=user, activa=True)
    if exclude_jti:
        qs = qs.exclude(token_jti=exclude_jti)
    count = qs.update(activa=False)
    logger.warning('All sessions invalidated for user %s (count=%d)', user.username, count)
    return count


def get_active_sessions(user) -> list:
    """Get all active sessions for a user."""
    from api.models import SesionActiva
    return list(
        SesionActiva.objects.filter(usuario=user, activa=True)
        .order_by('-creado_en')
        .values('id', 'ip_address', 'user_agent', 'creado_en', 'ultimo_uso')
    )


def update_session_activity(token_jti: str) -> None:
    """Update last activity timestamp for a session."""
    from api.models import SesionActiva
    SesionActiva.objects.filter(
        token_jti=token_jti, activa=True
    ).update(ultimo_uso=timezone.now())
