from decimal import Decimal
from typing import List, Dict
from .base import CountryConfig
from .registry import CountryRegistry


class DominicanRepublicConfig(CountryConfig):

    @property
    def code(self) -> str:
        return 'DO'

    @property
    def name(self) -> str:
        return 'República Dominicana'

    @property
    def currency_code(self) -> str:
        return 'DOP'

    @property
    def currency_symbol(self) -> str:
        return 'RD$'

    @property
    def tax_name(self) -> str:
        return 'ITBIS'

    @property
    def default_tax_rate(self) -> Decimal:
        return Decimal('18.00')

    def get_tax_rates(self) -> List[Dict]:
        return [
            {'codigo': 'ITBIS18', 'nombre': 'ITBIS 18%', 'tasa': Decimal('18.00'), 'tipo': 'GENERAL'},
            {'codigo': 'ITBIS16', 'nombre': 'ITBIS 16%', 'tasa': Decimal('16.00'), 'tipo': 'REDUCIDO'},
            {'codigo': 'EXENTO', 'nombre': 'Exento', 'tasa': Decimal('0.00'), 'tipo': 'EXENTO'},
            {'codigo': 'ISC', 'nombre': 'Impuesto Selectivo al Consumo', 'tasa': Decimal('10.00'), 'tipo': 'ESPECIAL'},
            {'codigo': 'PROPINA', 'nombre': 'Propina Legal 10%', 'tasa': Decimal('10.00'), 'tipo': 'ESPECIAL'},
        ]

    def get_document_types(self) -> List[Dict]:
        return [
            {'codigo': 'CEDULA', 'nombre': 'Cédula de Identidad', 'formato': r'^\d{3}-?\d{7}-?\d$'},
            {'codigo': 'RNC', 'nombre': 'Registro Nacional del Contribuyente', 'formato': r'^\d{1}-?\d{2}-?\d{5}-?\d$'},
            {'codigo': 'PASAPORTE', 'nombre': 'Pasaporte', 'formato': r'^[A-Z0-9]+$'},
        ]

    def get_invoice_types(self) -> List[Dict]:
        return [
            {'codigo': 'B01', 'nombre': 'Crédito Fiscal', 'requiere_rnc': True},
            {'codigo': 'B02', 'nombre': 'Consumidor Final', 'requiere_rnc': False},
            {'codigo': 'B14', 'nombre': 'Régimen Especial', 'requiere_rnc': True},
            {'codigo': 'B15', 'nombre': 'Gubernamental', 'requiere_rnc': True},
            {'codigo': 'B16', 'nombre': 'Exportaciones', 'requiere_rnc': False},
        ]

    def validate_tax_id(self, tax_id: str) -> bool:
        clean = tax_id.replace('-', '')
        if len(clean) == 9:  # RNC
            return clean.isdigit()
        elif len(clean) == 11:  # Cedula
            return clean.isdigit()
        return False

    def format_tax_id(self, tax_id: str) -> str:
        clean = tax_id.replace('-', '')
        if len(clean) == 9:
            return f"{clean[0]}-{clean[1:3]}-{clean[3:8]}-{clean[8]}"
        elif len(clean) == 11:
            return f"{clean[0:3]}-{clean[3:10]}-{clean[10]}"
        return tax_id

    def format_currency(self, amount: Decimal) -> str:
        return f"RD$ {amount:,.2f}"

    @property
    def fiscal_authority(self) -> str:
        return 'DGII'

    @property
    def invoice_format(self) -> str:
        return 'e-CF'

    def get_withholding_types(self) -> List[Dict]:
        return [
            {'codigo': 'ISR', 'nombre': 'Retención ISR', 'tasa': Decimal('10.00')},
            {'codigo': 'ITBIS_RET', 'nombre': 'Retención ITBIS', 'tasa': Decimal('18.00')},
        ]

    @property
    def phone_code(self) -> str:
        return '+1-809'

    @property
    def timezone(self) -> str:
        return 'America/Santo_Domingo'

    @property
    def locale(self) -> str:
        return 'es-DO'

    def get_denominations(self) -> List[Dict]:
        return [
            {'valor': 2000, 'nombre': 'RD$2,000'},
            {'valor': 1000, 'nombre': 'RD$1,000'},
            {'valor': 500, 'nombre': 'RD$500'},
            {'valor': 200, 'nombre': 'RD$200'},
            {'valor': 100, 'nombre': 'RD$100'},
            {'valor': 50, 'nombre': 'RD$50'},
            {'valor': 25, 'nombre': 'RD$25'},
            {'valor': 10, 'nombre': 'RD$10'},
            {'valor': 5, 'nombre': 'RD$5'},
            {'valor': 1, 'nombre': 'RD$1'},
        ]


# Auto-register
CountryRegistry.register(DominicanRepublicConfig())
