"""
CSV bank statement parser.
Handles common CSV formats from Dominican banks.
"""
import csv
import logging
from decimal import Decimal, InvalidOperation
from datetime import datetime
from io import StringIO
from typing import List

from .base import BaseParser, ParsedTransaction

logger = logging.getLogger('api.parsers')

# Common column name mappings
DATE_COLUMNS = {'fecha', 'date', 'fecha_operacion', 'fecha_valor', 'transaction_date'}
DESC_COLUMNS = {'descripcion', 'description', 'concepto', 'detalle', 'memo'}
AMOUNT_COLUMNS = {'monto', 'amount', 'importe', 'valor'}
DEBIT_COLUMNS = {'debito', 'debit', 'cargo', 'retiro'}
CREDIT_COLUMNS = {'credito', 'credit', 'abono', 'deposito'}
REF_COLUMNS = {'referencia', 'reference', 'ref', 'numero', 'numero_documento'}
BALANCE_COLUMNS = {'saldo', 'balance', 'saldo_disponible'}


class CSVBankParser(BaseParser):
    """Parser for CSV bank statement files."""

    DATE_FORMATS = ['%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y']

    def parse(self, file_content, **kwargs) -> List[ParsedTransaction]:
        if isinstance(file_content, bytes):
            file_content = file_content.decode('utf-8', errors='ignore')

        # Detect delimiter
        dialect = csv.Sniffer().sniff(file_content[:2048], delimiters=',;\t|')
        reader = csv.DictReader(StringIO(file_content), dialect=dialect)

        # Map columns
        fieldnames = [f.strip().lower() for f in (reader.fieldnames or [])]
        col_map = self._map_columns(fieldnames)

        transactions = []
        for row in reader:
            # Normalize keys
            normalized = {k.strip().lower(): v.strip() for k, v in row.items() if v}

            txn = self._parse_row(normalized, col_map)
            if txn:
                transactions.append(txn)

        logger.info('Parsed %d transactions from CSV file', len(transactions))
        return transactions

    def validate(self, file_content) -> bool:
        if isinstance(file_content, bytes):
            file_content = file_content.decode('utf-8', errors='ignore')
        try:
            csv.Sniffer().sniff(file_content[:2048])
            return True
        except csv.Error:
            return False

    def _map_columns(self, fieldnames):
        """Map CSV column names to standard fields."""
        mapping = {}
        for fn in fieldnames:
            fn_lower = fn.lower()
            if fn_lower in DATE_COLUMNS:
                mapping['fecha'] = fn
            elif fn_lower in DESC_COLUMNS:
                mapping['descripcion'] = fn
            elif fn_lower in AMOUNT_COLUMNS:
                mapping['monto'] = fn
            elif fn_lower in DEBIT_COLUMNS:
                mapping['debito'] = fn
            elif fn_lower in CREDIT_COLUMNS:
                mapping['credito'] = fn
            elif fn_lower in REF_COLUMNS:
                mapping['referencia'] = fn
            elif fn_lower in BALANCE_COLUMNS:
                mapping['saldo'] = fn
        return mapping

    def _parse_row(self, row, col_map):
        """Parse a single CSV row into a ParsedTransaction."""
        try:
            # Date
            date_col = col_map.get('fecha')
            if not date_col or date_col not in row:
                return None
            fecha = self._parse_date(row[date_col])
            if not fecha:
                return None

            # Amount
            monto = None
            if 'monto' in col_map and col_map['monto'] in row:
                monto = self._parse_amount(row[col_map['monto']])
            elif 'debito' in col_map or 'credito' in col_map:
                debito = self._parse_amount(row.get(col_map.get('debito', ''), '0'))
                credito = self._parse_amount(row.get(col_map.get('credito', ''), '0'))
                monto = credito - debito

            if monto is None:
                return None

            # Description
            descripcion = row.get(col_map.get('descripcion', ''), '')

            # Reference
            referencia = row.get(col_map.get('referencia', ''), '')

            # Balance
            saldo = None
            if 'saldo' in col_map and col_map['saldo'] in row:
                saldo = self._parse_amount(row[col_map['saldo']])

            return ParsedTransaction(
                fecha=fecha,
                descripcion=descripcion,
                monto=monto,
                referencia=referencia,
                saldo=saldo,
            )
        except Exception as e:
            logger.debug('Failed to parse CSV row: %s', e)
            return None

    def _parse_date(self, date_str):
        """Try multiple date formats."""
        if not date_str:
            return None
        for fmt in self.DATE_FORMATS:
            try:
                return datetime.strptime(date_str.strip(), fmt).date()
            except ValueError:
                continue
        return None

    def _parse_amount(self, amount_str):
        """Parse amount string handling various formats."""
        if not amount_str:
            return Decimal('0')
        try:
            cleaned = amount_str.strip().replace(',', '').replace(' ', '')
            # Handle parentheses for negative
            if cleaned.startswith('(') and cleaned.endswith(')'):
                cleaned = '-' + cleaned[1:-1]
            return Decimal(cleaned)
        except (InvalidOperation, ValueError):
            return Decimal('0')
