from decimal import Decimal
from typing import List, Dict
from .base import CountryConfig
from .registry import CountryRegistry


class ArgentinaConfig(CountryConfig):
    @property
    def code(self) -> str: return 'AR'
    @property
    def name(self) -> str: return 'Argentina'
    @property
    def currency_code(self) -> str: return 'ARS'
    @property
    def currency_symbol(self) -> str: return '$'
    @property
    def tax_name(self) -> str: return 'IVA'
    @property
    def default_tax_rate(self) -> Decimal: return Decimal('21.00')
    def get_tax_rates(self) -> List[Dict]:
        return [
            {'codigo': 'IVA21', 'nombre': 'IVA 21%', 'tasa': Decimal('21.00'), 'tipo': 'GENERAL'},
            {'codigo': 'IVA105', 'nombre': 'IVA 10.5%', 'tasa': Decimal('10.50'), 'tipo': 'REDUCIDO'},
            {'codigo': 'IVA27', 'nombre': 'IVA 27%', 'tasa': Decimal('27.00'), 'tipo': 'ESPECIAL'},
            {'codigo': 'EXENTO', 'nombre': 'Exento', 'tasa': Decimal('0.00'), 'tipo': 'EXENTO'},
        ]
    def get_document_types(self) -> List[Dict]:
        return [
            {'codigo': 'CUIT', 'nombre': 'CUIT', 'formato': r'^\d{2}-\d{8}-\d$'},
            {'codigo': 'DNI', 'nombre': 'DNI', 'formato': r'^\d{7,8}$'},
        ]
    def get_invoice_types(self) -> List[Dict]:
        return [
            {'codigo': 'A', 'nombre': 'Factura A', 'requiere_rnc': True},
            {'codigo': 'B', 'nombre': 'Factura B', 'requiere_rnc': False},
            {'codigo': 'C', 'nombre': 'Factura C', 'requiere_rnc': False},
        ]
    def validate_tax_id(self, tax_id: str) -> bool:
        clean = tax_id.replace('-', '')
        return clean.isdigit() and len(clean) == 11
    def format_tax_id(self, tax_id: str) -> str:
        clean = tax_id.replace('-', '')
        return f"{clean[:2]}-{clean[2:10]}-{clean[10]}" if len(clean) == 11 else tax_id
    def format_currency(self, amount: Decimal) -> str: return f"${amount:,.2f} ARS"
    @property
    def fiscal_authority(self) -> str: return 'AFIP'
    @property
    def invoice_format(self) -> str: return 'Factura Electrónica AFIP'
    def get_withholding_types(self) -> List[Dict]:
        return [
            {'codigo': 'GANANCIAS', 'nombre': 'Retención Ganancias', 'tasa': Decimal('6.00')},
            {'codigo': 'IVA_RET', 'nombre': 'Retención IVA', 'tasa': Decimal('21.00')},
        ]
    @property
    def phone_code(self) -> str: return '+54'
    @property
    def timezone(self) -> str: return 'America/Argentina/Buenos_Aires'
    @property
    def locale(self) -> str: return 'es-AR'
    def get_denominations(self) -> List[Dict]:
        return [
            {'valor': 10000, 'nombre': '$10,000'}, {'valor': 5000, 'nombre': '$5,000'},
            {'valor': 2000, 'nombre': '$2,000'}, {'valor': 1000, 'nombre': '$1,000'},
            {'valor': 500, 'nombre': '$500'}, {'valor': 200, 'nombre': '$200'},
        ]


CountryRegistry.register(ArgentinaConfig())
