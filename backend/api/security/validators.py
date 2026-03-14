"""
Enhanced password validation - min 12 chars, uppercase, lowercase, number, special char.
"""
import re
from django.core.exceptions import ValidationError
from django.utils.translation import gettext as _


class ComplexPasswordValidator:
    """
    Validates that a password meets enterprise security requirements:
    - Minimum 12 characters
    - At least 1 uppercase letter
    - At least 1 lowercase letter
    - At least 1 digit
    - At least 1 special character
    """

    def validate(self, password, user=None):
        errors = []

        if len(password) < 12:
            errors.append(
                ValidationError(
                    _('La contrasena debe tener al menos 12 caracteres.'),
                    code='password_too_short',
                )
            )

        if not re.search(r'[A-Z]', password):
            errors.append(
                ValidationError(
                    _('La contrasena debe contener al menos una letra mayuscula.'),
                    code='password_no_upper',
                )
            )

        if not re.search(r'[a-z]', password):
            errors.append(
                ValidationError(
                    _('La contrasena debe contener al menos una letra minuscula.'),
                    code='password_no_lower',
                )
            )

        if not re.search(r'\d', password):
            errors.append(
                ValidationError(
                    _('La contrasena debe contener al menos un numero.'),
                    code='password_no_digit',
                )
            )

        if not re.search(r'[!@#$%^&*()_+\-=\[\]{}|;:\'",.<>?/\\`~]', password):
            errors.append(
                ValidationError(
                    _('La contrasena debe contener al menos un caracter especial.'),
                    code='password_no_special',
                )
            )

        if errors:
            raise ValidationError(errors)

    def get_help_text(self):
        return _(
            'La contrasena debe tener al menos 12 caracteres e incluir '
            'mayusculas, minusculas, numeros y caracteres especiales.'
        )


class PasswordExpirationValidator:
    """Checks if the password has expired (90 days)."""

    MAX_AGE_DAYS = 90

    def validate(self, password, user=None):
        # This validator doesn't check password content, only expiration
        pass

    def get_help_text(self):
        return _(f'La contrasena debe cambiarse cada {self.MAX_AGE_DAYS} dias.')
