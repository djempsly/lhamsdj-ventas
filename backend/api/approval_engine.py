"""
Generic approval workflow engine.
Supports multi-step approvals for any model using GenericForeignKey.
"""
import logging
from decimal import Decimal
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

logger = logging.getLogger('api.approvals')


class ApprovalEngine:
    """
    Engine for managing multi-step approval workflows.

    Usage:
        engine = ApprovalEngine()
        solicitud = engine.submit(workflow, entity, solicitante, monto)
        engine.decide(solicitud, aprobador, 'APROBADA', comentario='OK')
    """

    def submit(self, workflow, entity, solicitante, monto=Decimal('0')):
        """
        Submit an entity for approval through a workflow.
        Returns the created SolicitudAprobacion or None if auto-approved.
        """
        from api.models import SolicitudAprobacion, WorkflowStep

        ct = ContentType.objects.get_for_model(entity)

        # Find the first applicable step based on monto
        primer_paso = self._get_first_applicable_step(workflow, monto)

        if primer_paso is None:
            logger.info(
                'No applicable steps for %s (monto=%s). Auto-approved.',
                entity, monto,
            )
            return None

        # Check auto-approve threshold
        if (primer_paso.auto_aprobar_bajo_monto is not None
                and monto <= primer_paso.auto_aprobar_bajo_monto):
            solicitud = SolicitudAprobacion.objects.create(
                workflow=workflow,
                content_type=ct,
                object_id=entity.pk,
                solicitante=solicitante,
                paso_actual=primer_paso,
                estado='APROBADA',
                monto=monto,
            )
            logger.info('Auto-approved solicitud %s (monto %s <= %s)',
                        solicitud.id, monto, primer_paso.auto_aprobar_bajo_monto)
            self._notify(solicitud, 'auto_aprobada')
            return solicitud

        solicitud = SolicitudAprobacion.objects.create(
            workflow=workflow,
            content_type=ct,
            object_id=entity.pk,
            solicitante=solicitante,
            paso_actual=primer_paso,
            estado='PENDIENTE',
            monto=monto,
        )
        logger.info('Created solicitud %s for %s, paso: %s',
                     solicitud.id, entity, primer_paso.nombre)
        self._notify(solicitud, 'nueva_solicitud')
        return solicitud

    def decide(self, solicitud, aprobador, decision, comentario=''):
        """
        Record a decision (APROBADA/RECHAZADA) on a solicitud.
        Advances to next step if approved, or rejects the whole solicitud.
        """
        from api.models import DecisionAprobacion

        if solicitud.estado != 'PENDIENTE':
            raise ValueError(f'Solicitud {solicitud.id} is not PENDIENTE (is {solicitud.estado})')

        paso_actual = solicitud.paso_actual
        if paso_actual is None:
            raise ValueError(f'Solicitud {solicitud.id} has no paso_actual')

        # Validate aprobador has the right role
        self._validate_aprobador(paso_actual, aprobador)

        DecisionAprobacion.objects.create(
            solicitud=solicitud,
            paso=paso_actual,
            aprobador=aprobador,
            decision=decision,
            comentario=comentario,
        )

        if decision == 'RECHAZADA':
            solicitud.estado = 'RECHAZADA'
            solicitud.save(update_fields=['estado', 'actualizado_en'])
            logger.info('Solicitud %s RECHAZADA by %s', solicitud.id, aprobador)
            self._notify(solicitud, 'rechazada')
            return solicitud

        # APROBADA — advance to next step
        siguiente_paso = self._get_next_step(solicitud.workflow, paso_actual)

        if siguiente_paso is None:
            # No more steps — fully approved
            solicitud.estado = 'APROBADA'
            solicitud.paso_actual = None
            solicitud.save(update_fields=['estado', 'paso_actual', 'actualizado_en'])
            logger.info('Solicitud %s fully APROBADA', solicitud.id)
            self._notify(solicitud, 'aprobada')
        else:
            # Check auto-approve on next step
            if (siguiente_paso.auto_aprobar_bajo_monto is not None
                    and solicitud.monto <= siguiente_paso.auto_aprobar_bajo_monto):
                solicitud.estado = 'APROBADA'
                solicitud.paso_actual = None
                solicitud.save(update_fields=['estado', 'paso_actual', 'actualizado_en'])
                logger.info('Solicitud %s auto-approved at step %s',
                            solicitud.id, siguiente_paso.nombre)
                self._notify(solicitud, 'aprobada')
            else:
                solicitud.paso_actual = siguiente_paso
                solicitud.save(update_fields=['paso_actual', 'actualizado_en'])
                logger.info('Solicitud %s advanced to step: %s',
                            solicitud.id, siguiente_paso.nombre)
                self._notify(solicitud, 'nueva_solicitud')

        return solicitud

    def escalate_timeouts(self):
        """
        Escalate solicitudes that have exceeded their step timeout.
        Called periodically by Celery beat.
        Returns count of escalated solicitudes.
        """
        from api.models import SolicitudAprobacion

        pendientes = SolicitudAprobacion.objects.filter(
            estado='PENDIENTE',
            paso_actual__isnull=False,
        ).select_related('paso_actual', 'workflow')

        escalated = 0
        for solicitud in pendientes:
            timeout_hours = solicitud.paso_actual.timeout_horas
            deadline = solicitud.actualizado_en + timezone.timedelta(hours=timeout_hours)

            if timezone.now() > deadline:
                siguiente = self._get_next_step(solicitud.workflow, solicitud.paso_actual)
                if siguiente:
                    solicitud.paso_actual = siguiente
                    solicitud.estado = 'ESCALADA'
                    solicitud.save(update_fields=['paso_actual', 'estado', 'actualizado_en'])
                    logger.warning('Solicitud %s escalated to step %s',
                                   solicitud.id, siguiente.nombre)
                    self._notify(solicitud, 'escalada')
                else:
                    # No higher step — auto-approve
                    solicitud.estado = 'APROBADA'
                    solicitud.paso_actual = None
                    solicitud.save(update_fields=['estado', 'paso_actual', 'actualizado_en'])
                    logger.warning('Solicitud %s auto-approved after timeout (no higher step)',
                                   solicitud.id)
                    self._notify(solicitud, 'aprobada')
                escalated += 1

        return escalated

    # -------------------------------------------------------------------------
    # Private helpers
    # -------------------------------------------------------------------------

    def _get_first_applicable_step(self, workflow, monto):
        """Get the first step that applies to the given amount."""
        from api.models import WorkflowStep

        steps = WorkflowStep.objects.filter(workflow=workflow).order_by('orden')
        for step in steps:
            if step.monto_minimo is not None and monto < step.monto_minimo:
                continue
            if step.monto_maximo is not None and monto > step.monto_maximo:
                continue
            return step
        # If no range-specific step matches, return the first step
        return steps.first()

    def _get_next_step(self, workflow, current_step):
        """Get the next step in the workflow after current_step."""
        from api.models import WorkflowStep

        return WorkflowStep.objects.filter(
            workflow=workflow,
            orden__gt=current_step.orden,
        ).order_by('orden').first()

    def _validate_aprobador(self, paso, aprobador):
        """Validate that the aprobador has the right role/assignment for this step."""
        if paso.usuario_especifico and paso.usuario_especifico != aprobador:
            raise PermissionError(
                f'Step "{paso.nombre}" requires specific user {paso.usuario_especifico}'
            )
        if paso.rol_aprobador and aprobador.rol != paso.rol_aprobador:
            # Allow ADMIN_NEGOCIO to approve anything
            if aprobador.rol != 'ADMIN_NEGOCIO':
                raise PermissionError(
                    f'Step "{paso.nombre}" requires role {paso.rol_aprobador}, '
                    f'but user has role {aprobador.rol}'
                )

    def _notify(self, solicitud, event_type):
        """Send WebSocket notification for approval events."""
        try:
            from channels.layers import get_channel_layer
            from asgiref.sync import async_to_sync

            channel_layer = get_channel_layer()
            if channel_layer is None:
                return

            negocio_id = str(solicitud.workflow.negocio_id)
            group_name = f'notificaciones_{negocio_id}'

            async_to_sync(channel_layer.group_send)(
                group_name,
                {
                    'type': 'notificacion',
                    'data': {
                        'tipo': 'aprobacion',
                        'evento': event_type,
                        'solicitud_id': str(solicitud.id),
                        'estado': solicitud.estado,
                        'monto': str(solicitud.monto),
                    },
                },
            )
        except Exception as e:
            logger.debug('Could not send WS notification: %s', e)
