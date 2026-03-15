"""
OFX/QFX bank file parser.
Uses ofxparse library.
"""
import logging
from decimal import Decimal
from io import BytesIO
from typing import List

from .base import BaseParser, ParsedTransaction

logger = logging.getLogger('api.parsers')


class OFXParser(BaseParser):
    """Parser for OFX and QFX bank statement files."""

    def parse(self, file_content, **kwargs) -> List[ParsedTransaction]:
        try:
            from ofxparse import OfxParser as _OfxParser
        except ImportError:
            raise ImportError('ofxparse is required. Install with: pip install ofxparse')

        if isinstance(file_content, str):
            file_content = file_content.encode('utf-8')

        ofx = _OfxParser.parse(BytesIO(file_content))
        transactions = []

        for account in ofx.accounts:
            for txn in account.statement.transactions:
                transactions.append(ParsedTransaction(
                    fecha=txn.date.date() if hasattr(txn.date, 'date') else txn.date,
                    descripcion=txn.memo or txn.payee or '',
                    monto=Decimal(str(txn.amount)),
                    referencia=txn.id or '',
                    saldo=None,
                ))

        logger.info('Parsed %d transactions from OFX file', len(transactions))
        return transactions

    def validate(self, file_content) -> bool:
        if isinstance(file_content, str):
            file_content = file_content.encode('utf-8')

        content_str = file_content.decode('utf-8', errors='ignore')
        return 'OFXHEADER' in content_str or '<OFX>' in content_str.upper()
