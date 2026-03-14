"""
Logging filter to mask sensitive data in log output.
"""
import logging
import re


PATTERNS = [
    (re.compile(r'password["\s:=]+["\']?[\w!@#$%^&*]+', re.IGNORECASE), 'password=***'),
    (re.compile(r'secret["\s:=]+["\']?[\w!@#$%^&*]+', re.IGNORECASE), 'secret=***'),
    (re.compile(r'token["\s:=]+["\']?[\w\-._~+/]+=*', re.IGNORECASE), 'token=***'),
    (re.compile(r'api[_-]?key["\s:=]+["\']?[\w\-]+', re.IGNORECASE), 'api_key=***'),
    (re.compile(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b'), '****-****-****-****'),
    (re.compile(r'[\w.+-]+@[\w-]+\.[\w.]+'), '***@***.***'),
    (re.compile(r'\b\d{3}-?\d{7}-?\d\b'), '***-*******-*'),  # RNC/Cedula RD
]


class SensitiveDataFilter(logging.Filter):
    """Filter that masks sensitive data in log messages."""

    def filter(self, record):
        if isinstance(record.msg, str):
            for pattern, replacement in PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)

        if record.args:
            new_args = []
            for arg in (record.args if isinstance(record.args, tuple) else (record.args,)):
                if isinstance(arg, str):
                    masked = arg
                    for pattern, replacement in PATTERNS:
                        masked = pattern.sub(replacement, masked)
                    new_args.append(masked)
                else:
                    new_args.append(arg)
            record.args = tuple(new_args)

        return True
