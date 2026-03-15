from .base import BaseParser
from .ofx_parser import OFXParser
from .mt940_parser import MT940Parser
from .csv_parser import CSVBankParser

PARSERS = {
    'OFX': OFXParser,
    'MT940': MT940Parser,
    'CSV_BANCO': CSVBankParser,
}


def get_parser(formato):
    """Get parser class for a given format."""
    parser_cls = PARSERS.get(formato)
    if parser_cls is None:
        raise ValueError(f'Unsupported format: {formato}')
    return parser_cls()
