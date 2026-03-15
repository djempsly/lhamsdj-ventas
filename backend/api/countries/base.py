from abc import ABC, abstractmethod
from decimal import Decimal
from typing import List, Dict, Optional


class CountryConfig(ABC):
    """Abstract base class for country-specific configurations."""

    @property
    @abstractmethod
    def code(self) -> str:
        """ISO 3166-1 alfa-3 country code."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @property
    @abstractmethod
    def currency_code(self) -> str:
        """ISO 4217 currency code."""
        ...

    @property
    @abstractmethod
    def currency_symbol(self) -> str:
        ...

    @property
    @abstractmethod
    def tax_name(self) -> str:
        """Name of the main tax (ITBIS, IVA, VAT, etc.)"""
        ...

    @property
    @abstractmethod
    def default_tax_rate(self) -> Decimal:
        ...

    @abstractmethod
    def get_tax_rates(self) -> List[Dict]:
        """Returns all tax rates for this country."""
        ...

    @abstractmethod
    def get_document_types(self) -> List[Dict]:
        """Returns valid document types (RNC, Cedula, NIT, RFC, etc.)"""
        ...

    @abstractmethod
    def get_invoice_types(self) -> List[Dict]:
        """Returns invoice/receipt types (NCF types, CFDI types, etc.)"""
        ...

    @abstractmethod
    def validate_tax_id(self, tax_id: str) -> bool:
        """Validates a tax identification number for this country."""
        ...

    @abstractmethod
    def format_tax_id(self, tax_id: str) -> str:
        """Formats a tax ID according to country standards."""
        ...

    @abstractmethod
    def format_currency(self, amount: Decimal) -> str:
        """Formats a monetary amount according to country standards."""
        ...

    @property
    @abstractmethod
    def fiscal_authority(self) -> str:
        """Name of the fiscal authority (DGII, SAT, DIAN, etc.)"""
        ...

    @property
    @abstractmethod
    def invoice_format(self) -> str:
        """Electronic invoice format (e-CF, CFDI, etc.)"""
        ...

    @abstractmethod
    def get_withholding_types(self) -> List[Dict]:
        """Returns withholding tax types for this country."""
        ...

    @property
    @abstractmethod
    def phone_code(self) -> str:
        """International phone code."""
        ...

    @property
    @abstractmethod
    def timezone(self) -> str:
        """Default timezone."""
        ...

    @property
    @abstractmethod
    def locale(self) -> str:
        """Default locale code (es-DO, es-MX, etc.)"""
        ...

    @abstractmethod
    def get_denominations(self) -> List[Dict]:
        """Returns currency denominations for cash drawer."""
        ...
