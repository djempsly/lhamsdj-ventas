"""
JWT Authentication middleware for Django Channels WebSocket connections.
Validates JWT token from query string parameter ?token=<jwt>.
"""
import logging
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger('security')


@database_sync_to_async
def get_user_from_token(token_str):
    """Validate JWT token and return the associated user."""
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from api.models import Usuario

        access_token = AccessToken(token_str)
        user_id = access_token.get('user_id')
        if not user_id:
            return AnonymousUser()

        user = Usuario.objects.select_related('negocio').get(id=user_id)
        if not user.is_active:
            return AnonymousUser()

        return user
    except Exception as e:
        logger.debug('WebSocket JWT auth failed: %s', e)
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """Channels middleware that authenticates WebSocket connections via JWT.

    Usage in routing.py:
        JWTAuthMiddleware(URLRouter([...]))

    Client connects with: ws://host/ws/path/?token=<jwt_access_token>
    """

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        params = parse_qs(query_string)
        token_list = params.get('token', [])

        if token_list:
            scope['user'] = await get_user_from_token(token_list[0])
        else:
            scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)
