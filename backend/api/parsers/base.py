"""
Base parser interface for bank file imports.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from decimal import Decimal
from datetime import date
from typing import List


@dataclass
class ParsedTransaction:
    """Standardized transaction from any bank file format."""
    fecha: date
    descripcion: str
    monto: Decimal
    referencia: str = ''
    saldo: Decimal = None


class BaseParser(ABC):
    """Base class for bank file parsers."""

    @abstractmethod
    def parse(self, file_content, **kwargs) -> List[ParsedTransaction]:
        """
        Parse file content and return list of standardized transactions.

        Args:
            file_content: File content (bytes or string depending on format)
            **kwargs: Additional format-specific options

        Returns:
            List of ParsedTransaction objects
        """
        raise NotImplementedError

    @abstractmethod
    def validate(self, file_content) -> bool:
        """Check if the file content is valid for this parser."""
        raise NotImplementedError
