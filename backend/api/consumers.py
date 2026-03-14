"""
WebSocket consumers for real-time security notifications.
"""
import json
import logging

from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger('security')


class NotificacionesConsumer(AsyncJsonWebsocketConsumer):
    """WebSocket consumer for real-time security alerts and notifications.

    Requires authenticated user with valid JWT.
    Provides multi-tenant isolation via negocio-specific groups.
    """

    async def connect(self):
        user = self.scope.get('user')

        # Reject unauthenticated connections
        if not user or isinstance(user, AnonymousUser):
            await self.close(code=4001)
            return

        # Multi-tenant isolation: group by negocio
        negocio_id = getattr(user, 'negocio_id', None)
        if not negocio_id:
            await self.close(code=4002)
            return

        self.negocio_group = f'notificaciones_{negocio_id}'
        self.user_group = f'user_{user.id}'

        # Join tenant group and personal group
        await self.channel_layer.group_add(self.negocio_group, self.channel_name)
        await self.channel_layer.group_add(self.user_group, self.channel_name)

        await self.accept()
        logger.info('WebSocket connected: user=%s negocio=%s', user.username, negocio_id)

    async def disconnect(self, close_code):
        if hasattr(self, 'negocio_group'):
            await self.channel_layer.group_discard(self.negocio_group, self.channel_name)
        if hasattr(self, 'user_group'):
            await self.channel_layer.group_discard(self.user_group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Clients only receive; ignore inbound messages
        pass

    # --- Event handlers for channel layer messages ---

    async def alerta_seguridad(self, event):
        """Handle security alert broadcast."""
        await self.send_json({
            'type': 'alerta_seguridad',
            'data': event.get('data', {}),
        })

    async def notificacion(self, event):
        """Handle generic notification."""
        await self.send_json({
            'type': 'notificacion',
            'data': event.get('data', {}),
        })
