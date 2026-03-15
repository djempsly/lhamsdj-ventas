from django.core.management.base import BaseCommand
from api.countries.registry import CountryRegistry
from api.models import Pais, Impuesto


class Command(BaseCommand):
    help = 'Load country configuration (idempotent). Usage: python manage.py load_country DO'

    def add_arguments(self, parser):
        parser.add_argument('country_code', type=str, help='ISO 3166-1 alpha-2 code (e.g., DO, MX, CO)')
        parser.add_argument('--all', action='store_true', help='Load all registered countries')

    def handle(self, *args, **options):
        # Import all country modules to ensure registration
        from api.countries import rd, mx, co, ar, us  # noqa: F401

        if options['all']:
            codes = CountryRegistry.available_codes()
        else:
            codes = [options['country_code'].upper()]

        for code in codes:
            config = CountryRegistry.get(code)
            if not config:
                self.stderr.write(self.style.ERROR(f'Country {code} not registered'))
                continue

            pais, created = Pais.objects.update_or_create(
                codigo=config.code,
                defaults={
                    'nombre': config.name,
                    'moneda_codigo': config.currency_code,
                    'moneda_simbolo': config.currency_symbol,
                    'tasa_impuesto_defecto': config.default_tax_rate,
                    'nombre_impuesto': config.tax_name,
                    'formato_factura': config.invoice_format,
                    'activo': True,
                }
            )
            action = 'Created' if created else 'Updated'
            self.stdout.write(self.style.SUCCESS(f'{action} country: {config.name} ({config.code})'))

            for tax in config.get_tax_rates():
                imp, imp_created = Impuesto.objects.update_or_create(
                    pais=pais,
                    codigo=tax['codigo'],
                    defaults={
                        'nombre': tax['nombre'],
                        'tasa': tax['tasa'],
                        'tipo': tax['tipo'],
                        'activo': True,
                    }
                )
                imp_action = 'Created' if imp_created else 'Updated'
                self.stdout.write(f'  {imp_action} tax: {tax["nombre"]} ({tax["tasa"]}%)')

        self.stdout.write(self.style.SUCCESS('Done!'))
