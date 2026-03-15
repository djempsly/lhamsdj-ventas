from decimal import Decimal
from typing import List, Dict
from .base import CountryConfig
from .registry import CountryRegistry


class MexicoConfig(CountryConfig):
    @property
    def code(self) -> str: return 'MX'
    @property
    def name(self) -> str: return 'México'
    @property
    def currency_code(self) -> str: return 'MXN'
    @property
    def currency_symbol(self) -> str: return '$'
    @property
    def tax_name(self) -> str: return 'IVA'
    @property
    def default_tax_rate(self) -> Decimal: return Decimal('16.00')
    def get_tax_rates(self) -> List[Dict]:
        return [
            {'codigo': 'IVA16', 'nombre': 'IVA 16%', 'tasa': Decimal('16.00'), 'tipo': 'GENERAL'},
            {'codigo': 'IVA0', 'nombre': 'Tasa 0%', 'tasa': Decimal('0.00'), 'tipo': 'EXENTO'},
            {'codigo': 'IEPS', 'nombre': 'IEPS', 'tasa': Decimal('8.00'), 'tipo': 'ESPECIAL'},
        ]
    def get_document_types(self) -> List[Dict]:
        return [{'codigo': 'RFC', 'nombre': 'RFC', 'formato': r'^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$'}]
    def get_invoice_types(self) -> List[Dict]:
        return [
            {'codigo': 'I', 'nombre': 'Ingreso', 'requiere_rnc': True},
            {'codigo': 'E', 'nombre': 'Egreso', 'requiere_rnc': True},
            {'codigo': 'T', 'nombre': 'Traslado', 'requiere_rnc': False},
            {'codigo': 'P', 'nombre': 'Pago', 'requiere_rnc': True},
        ]
    def validate_tax_id(self, tax_id: str) -> bool:
        import re
        return bool(re.match(r'^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$', tax_id))
    def format_tax_id(self, tax_id: str) -> str: return tax_id.upper()
    def format_currency(self, amount: Decimal) -> str: return f"${amount:,.2f} MXN"
    @property
    def fiscal_authority(self) -> str: return 'SAT'
    @property
    def invoice_format(self) -> str: return 'CFDI 4.0'
    def get_withholding_types(self) -> List[Dict]:
        return [{'codigo': 'ISR', 'nombre': 'Retención ISR', 'tasa': Decimal('10.00')}]
    @property
    def phone_code(self) -> str: return '+52'
    @property
    def timezone(self) -> str: return 'America/Mexico_City'
    @property
    def locale(self) -> str: return 'es-MX'
    def get_denominations(self) -> List[Dict]:
        return [
            {'valor': 1000, 'nombre': '$1,000'}, {'valor': 500, 'nombre': '$500'},
            {'valor': 200, 'nombre': '$200'}, {'valor': 100, 'nombre': '$100'},
            {'valor': 50, 'nombre': '$50'}, {'valor': 20, 'nombre': '$20'},
        ]


CountryRegistry.register(MexicoConfig())
