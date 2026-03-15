"""
Management command for running monthly depreciation.

Usage:
    python manage.py depreciar --mes 2024-01
    python manage.py depreciar --mes 2024-01 --negocio <uuid>
"""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from decimal import Decimal
import logging

logger = logging.getLogger('api')


class Command(BaseCommand):
    help = 'Ejecutar depreciación mensual de activos fijos'

    def add_arguments(self, parser):
        parser.add_argument(
            '--mes', type=str, required=True,
            help='Mes a depreciar en formato YYYY-MM',
        )
        parser.add_argument(
            '--negocio', type=str, default=None,
            help='UUID del negocio (opcional, si no se indica se procesan todos)',
        )
        parser.add_argument(
            '--dry-run', action='store_true',
            help='Simular sin guardar cambios',
        )

    def handle(self, *args, **options):
        from api.models import (
            Negocio, ActivoFijo, PeriodoContable, DepreciacionMensual,
            AsientoContable, LineaAsiento,
        )

        mes_str = options['mes']
        try:
            year, month = mes_str.split('-')
            year, month = int(year), int(month)
        except (ValueError, AttributeError):
            raise CommandError('Formato de mes inválido. Use YYYY-MM')

        negocio_id = options.get('negocio')
        dry_run = options['dry_run']

        negocios_qs = Negocio.objects.filter(estado_licencia='ACTIVA')
        if negocio_id:
            negocios_qs = negocios_qs.filter(id=negocio_id)

        total_depreciados = 0
        total_omitidos = 0
        total_errores = 0

        for negocio in negocios_qs:
            self.stdout.write(f'\nProcesando: {negocio.nombre_comercial}')

            # Find the periodo contable that covers this month
            from datetime import date
            fecha_ref = date(year, month, 1)

            periodo = PeriodoContable.objects.filter(
                negocio=negocio,
                estado='ABIERTO',
                fecha_inicio__lte=fecha_ref,
                fecha_fin__gte=fecha_ref,
            ).first()

            if not periodo:
                self.stderr.write(
                    f'  No se encontró periodo contable abierto para {mes_str}'
                )
                continue

            activos = ActivoFijo.objects.filter(
                negocio=negocio, estado='ACTIVO',
            ).exclude(depreciaciones__periodo=periodo)

            for activo in activos:
                dep_acum = activo.depreciacion_acumulada
                base = activo.base_depreciable

                if dep_acum >= base:
                    if not dry_run:
                        activo.estado = 'DEPRECIADO_TOTAL'
                        activo.save(update_fields=['estado'])
                    total_omitidos += 1
                    self.stdout.write(f'  {activo.codigo}: ya totalmente depreciado')
                    continue

                monto = activo.depreciacion_mensual_lineal
                if dep_acum + monto > base:
                    monto = base - dep_acum

                nueva_acum = dep_acum + monto
                valor_libros = activo.costo_adquisicion - nueva_acum

                if dry_run:
                    self.stdout.write(
                        f'  [DRY-RUN] {activo.codigo}: depreciación={monto}, '
                        f'acumulada={nueva_acum}, valor_libros={valor_libros}'
                    )
                    total_depreciados += 1
                    continue

                try:
                    with transaction.atomic():
                        asiento = AsientoContable.objects.create(
                            negocio=negocio,
                            periodo=periodo,
                            fecha=periodo.fecha_fin,
                            tipo='AUTOMATICO',
                            descripcion=f'Depreciación {activo.codigo} - {mes_str}',
                            estado='APROBADO',
                            total_debe=monto,
                            total_haber=monto,
                        )
                        LineaAsiento.objects.create(
                            asiento=asiento, cuenta=activo.cuenta_gasto,
                            descripcion=f'Gasto depreciación {activo.codigo}',
                            debe=monto, haber=0,
                        )
                        LineaAsiento.objects.create(
                            asiento=asiento, cuenta=activo.cuenta_depreciacion,
                            descripcion=f'Depreciación acumulada {activo.codigo}',
                            debe=0, haber=monto,
                        )
                        DepreciacionMensual.objects.create(
                            activo=activo, periodo=periodo,
                            fecha=periodo.fecha_fin,
                            monto_depreciacion=monto,
                            depreciacion_acumulada=nueva_acum,
                            valor_en_libros=valor_libros,
                            asiento_contable=asiento,
                        )
                        if nueva_acum >= base:
                            activo.estado = 'DEPRECIADO_TOTAL'
                            activo.save(update_fields=['estado'])

                    total_depreciados += 1
                    self.stdout.write(
                        f'  {activo.codigo}: depreciación={monto}, acumulada={nueva_acum}'
                    )
                except Exception as e:
                    total_errores += 1
                    self.stderr.write(f'  ERROR {activo.codigo}: {e}')

        self.stdout.write(self.style.SUCCESS(
            f'\nResumen: {total_depreciados} depreciados, '
            f'{total_omitidos} omitidos, {total_errores} errores'
        ))
