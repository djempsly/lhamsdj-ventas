import logging
from rest_framework_simplejwt.authentication import JWTAuthentication

logger = logging.getLogger('security')


class CookieJWTAuthentication(JWTAuthentication):
    """
    JWT authentication that reads the access token from an httpOnly cookie.
    Falls back to the standard Authorization header for API clients.
    """

    def authenticate(self, request):
        raw_token = request.COOKIES.get('access_token')

        if raw_token is None:
            return super().authenticate(request)

        validated_token = self.get_validated_token(raw_token)
        user = self.get_user(validated_token)
        return user, validated_token
