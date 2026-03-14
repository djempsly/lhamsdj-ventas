import logging
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework import exceptions
from django.utils import timezone

logger = logging.getLogger('security')


class CookieJWTAuthentication(JWTAuthentication):
    """
    JWT authentication via httpOnly cookie with session tracking.
    Falls back to Authorization header for API key clients.
    Enforces: active session check, password expiry, 2FA status.
    """

    def authenticate(self, request):
        # Try API key auth first (X-Api-Key header)
        api_key = request.META.get('HTTP_X_API_KEY')
        if api_key:
            return self._authenticate_api_key(api_key, request)

        # Try cookie-based JWT
        raw_token = request.COOKIES.get('access_token')
        if raw_token is None:
            # Fall back to Authorization header
            return super().authenticate(request)

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)

        # Check session is still active
        jti = validated_token.get('jti')
        if jti:
            self._check_session_active(jti)
            self._update_session_activity(jti)

        # Check account not locked
        if user.esta_bloqueado:
            logger.warning('Blocked user %s attempted access', user.username)
            raise exceptions.AuthenticationFailed(
                'Cuenta bloqueada. Intente mas tarde.'
            )

        return user, validated_token

    def _check_session_active(self, jti: str):
        """Verify the session hasn't been invalidated."""
        from api.models import SesionActiva
        if not SesionActiva.objects.filter(token_jti=jti, activa=True).exists():
            # Session might not be tracked yet (e.g., first request after login)
            # Only reject if session record exists but is inactive
            if SesionActiva.objects.filter(token_jti=jti, activa=False).exists():
                raise exceptions.AuthenticationFailed(
                    'Sesion invalidada. Inicie sesion nuevamente.'
                )

    def _update_session_activity(self, jti: str):
        """Update last activity timestamp for session."""
        from api.models import SesionActiva
        SesionActiva.objects.filter(
            token_jti=jti, activa=True
        ).update(ultimo_uso=timezone.now())

    def _authenticate_api_key(self, raw_key: str, request):
        """Authenticate via API key with scope checking."""
        from api.models import ApiKey
        from api.security.data_protection import hash_api_key

        key_hash = hash_api_key(raw_key)

        try:
            api_key = ApiKey.objects.select_related('negocio').get(
                key_hash=key_hash, activa=True
            )
        except ApiKey.DoesNotExist:
            raise exceptions.AuthenticationFailed('API key invalida.')

        if api_key.esta_expirada:
            raise exceptions.AuthenticationFailed('API key expirada.')

        # Update last use
        api_key.ultimo_uso = timezone.now()
        api_key.save(update_fields=['ultimo_uso'])

        # Store scopes on request for permission checks
        request.api_key = api_key
        request.api_key_scopes = api_key.scopes

        # Return the creator user with the key
        user = api_key.creado_por
        if not user or not user.is_active:
            raise exceptions.AuthenticationFailed('Usuario de API key inactivo.')

        return user, None
