"""
MT940/SWIFT bank statement parser.
Basic implementation that handles common MT940 format.
"""
import re
import logging
from decimal import Decimal
from datetime import datetime
from typing import List

from .base import BaseParser, ParsedTransaction

logger = logging.getLogger('api.parsers')

# MT940 tags
TAG_61 = re.compile(r':61:(\d{6})(\d{4})?(C|D|RC|RD)(\w?)(\d+,\d{2})([\w.]+)//(.*)')
TAG_86 = re.compile(r':86:(.*)')


class MT940Parser(BaseParser):
    """Parser for MT940/SWIFT bank statement files."""

    def parse(self, file_content, **kwargs) -> List[ParsedTransaction]:
        if isinstance(file_content, bytes):
            file_content = file_content.decode('utf-8', errors='ignore')

        transactions = []
        lines = file_content.split('\n')
        i = 0

        while i < len(lines):
            line = lines[i].strip()

            if line.startswith(':61:'):
                txn = self._parse_tag_61(line)
                if txn:
                    # Look for :86: tag on next lines
                    description_parts = []
                    j = i + 1
                    while j < len(lines):
                        next_line = lines[j].strip()
                        if next_line.startswith(':86:'):
                            description_parts.append(next_line[4:])
                            j += 1
                            # Continuation lines
                            while j < len(lines) and not lines[j].strip().startswith(':'):
                                description_parts.append(lines[j].strip())
                                j += 1
                            break
                        elif next_line.startswith(':'):
                            break
                        j += 1

                    if description_parts:
                        txn.descripcion = ' '.join(description_parts)

                    transactions.append(txn)

            i += 1

        logger.info('Parsed %d transactions from MT940 file', len(transactions))
        return transactions

    def validate(self, file_content) -> bool:
        if isinstance(file_content, bytes):
            file_content = file_content.decode('utf-8', errors='ignore')
        return ':20:' in file_content and ':60' in file_content

    def _parse_tag_61(self, line):
        """Parse a :61: transaction line."""
        try:
            content = line[4:]
            # Date (YYMMDD)
            date_str = content[:6]
            fecha = datetime.strptime(date_str, '%y%m%d').date()

            # Skip optional entry date (4 chars)
            pos = 6
            if len(content) > 10 and content[6:10].isdigit():
                pos = 10

            # Debit/Credit indicator
            dc = ''
            if content[pos:pos + 2] in ('RC', 'RD'):
                dc = content[pos:pos + 2]
                pos += 2
            elif content[pos] in ('C', 'D'):
                dc = content[pos]
                pos += 1

            # Amount — find the pattern N followed by digits
            amount_match = re.search(r'(\d+,\d{2})', content[pos:])
            if not amount_match:
                return None

            amount_str = amount_match.group(1).replace(',', '.')
            monto = Decimal(amount_str)

            # Negate for debits
            if dc in ('D', 'RD'):
                monto = -monto

            # Reference — after // if present
            referencia = ''
            ref_match = content.find('//')
            if ref_match >= 0:
                referencia = content[ref_match + 2:].strip()

            return ParsedTransaction(
                fecha=fecha,
                descripcion='',
                monto=monto,
                referencia=referencia,
            )
        except Exception as e:
            logger.warning('Failed to parse MT940 :61: line: %s — %s', line, e)
            return None
