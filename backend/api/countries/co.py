from decimal import Decimal
from typing import List, Dict
from .base import CountryConfig
from .registry import CountryRegistry


class ColombiaConfig(CountryConfig):
    @property
    def code(self) -> str: return 'CO'
    @property
    def name(self) -> str: return 'Colombia'
    @property
    def currency_code(self) -> str: return 'COP'
    @property
    def currency_symbol(self) -> str: return '$'
    @property
    def tax_name(self) -> str: return 'IVA'
    @property
    def default_tax_rate(self) -> Decimal: return Decimal('19.00')
    def get_tax_rates(self) -> List[Dict]:
        return [
            {'codigo': 'IVA19', 'nombre': 'IVA 19%', 'tasa': Decimal('19.00'), 'tipo': 'GENERAL'},
            {'codigo': 'IVA5', 'nombre': 'IVA 5%', 'tasa': Decimal('5.00'), 'tipo': 'REDUCIDO'},
            {'codigo': 'EXENTO', 'nombre': 'Exento', 'tasa': Decimal('0.00'), 'tipo': 'EXENTO'},
        ]
    def get_document_types(self) -> List[Dict]:
        return [
            {'codigo': 'NIT', 'nombre': 'NIT', 'formato': r'^\d{9}-?\d$'},
            {'codigo': 'CC', 'nombre': 'Cédula de Ciudadanía', 'formato': r'^\d{6,10}$'},
        ]
    def get_invoice_types(self) -> List[Dict]:
        return [{'codigo': 'FE', 'nombre': 'Factura Electrónica', 'requiere_rnc': True}]
    def validate_tax_id(self, tax_id: str) -> bool:
        clean = tax_id.replace('-', '')
        return clean.isdigit() and len(clean) == 10
    def format_tax_id(self, tax_id: str) -> str:
        clean = tax_id.replace('-', '')
        return f"{clean[:-1]}-{clean[-1]}" if len(clean) == 10 else tax_id
    def format_currency(self, amount: Decimal) -> str: return f"${amount:,.0f} COP"
    @property
    def fiscal_authority(self) -> str: return 'DIAN'
    @property
    def invoice_format(self) -> str: return 'Factura Electrónica DIAN'
    def get_withholding_types(self) -> List[Dict]:
        return [
            {'codigo': 'RETEFUENTE', 'nombre': 'Retención en la Fuente', 'tasa': Decimal('3.50')},
            {'codigo': 'RETEIVA', 'nombre': 'Retención IVA', 'tasa': Decimal('15.00')},
            {'codigo': 'RETEICA', 'nombre': 'Retención ICA', 'tasa': Decimal('1.00')},
        ]
    @property
    def phone_code(self) -> str: return '+57'
    @property
    def timezone(self) -> str: return 'America/Bogota'
    @property
    def locale(self) -> str: return 'es-CO'
    def get_denominations(self) -> List[Dict]:
        return [
            {'valor': 100000, 'nombre': '$100,000'}, {'valor': 50000, 'nombre': '$50,000'},
            {'valor': 20000, 'nombre': '$20,000'}, {'valor': 10000, 'nombre': '$10,000'},
            {'valor': 5000, 'nombre': '$5,000'}, {'valor': 2000, 'nombre': '$2,000'},
            {'valor': 1000, 'nombre': '$1,000'},
        ]


CountryRegistry.register(ColombiaConfig())
