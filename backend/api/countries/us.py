from decimal import Decimal
from typing import List, Dict
from .base import CountryConfig
from .registry import CountryRegistry


class USAConfig(CountryConfig):
    @property
    def code(self) -> str: return 'US'
    @property
    def name(self) -> str: return 'United States'
    @property
    def currency_code(self) -> str: return 'USD'
    @property
    def currency_symbol(self) -> str: return '$'
    @property
    def tax_name(self) -> str: return 'Sales Tax'
    @property
    def default_tax_rate(self) -> Decimal: return Decimal('0.00')
    def get_tax_rates(self) -> List[Dict]:
        return [
            {'codigo': 'NO_TAX', 'nombre': 'No Federal Sales Tax', 'tasa': Decimal('0.00'), 'tipo': 'GENERAL'},
        ]
    def get_document_types(self) -> List[Dict]:
        return [
            {'codigo': 'EIN', 'nombre': 'EIN', 'formato': r'^\d{2}-\d{7}$'},
            {'codigo': 'SSN', 'nombre': 'SSN', 'formato': r'^\d{3}-\d{2}-\d{4}$'},
        ]
    def get_invoice_types(self) -> List[Dict]:
        return [{'codigo': 'INV', 'nombre': 'Invoice', 'requiere_rnc': False}]
    def validate_tax_id(self, tax_id: str) -> bool:
        clean = tax_id.replace('-', '')
        return clean.isdigit() and len(clean) == 9
    def format_tax_id(self, tax_id: str) -> str:
        clean = tax_id.replace('-', '')
        return f"{clean[:2]}-{clean[2:]}" if len(clean) == 9 else tax_id
    def format_currency(self, amount: Decimal) -> str: return f"${amount:,.2f}"
    @property
    def fiscal_authority(self) -> str: return 'IRS'
    @property
    def invoice_format(self) -> str: return 'Invoice'
    def get_withholding_types(self) -> List[Dict]:
        return [{'codigo': 'FEDERAL', 'nombre': 'Federal Withholding', 'tasa': Decimal('24.00')}]
    @property
    def phone_code(self) -> str: return '+1'
    @property
    def timezone(self) -> str: return 'America/New_York'
    @property
    def locale(self) -> str: return 'en-US'
    def get_denominations(self) -> List[Dict]:
        return [
            {'valor': 100, 'nombre': '$100'}, {'valor': 50, 'nombre': '$50'},
            {'valor': 20, 'nombre': '$20'}, {'valor': 10, 'nombre': '$10'},
            {'valor': 5, 'nombre': '$5'}, {'valor': 1, 'nombre': '$1'},
        ]


CountryRegistry.register(USAConfig())
