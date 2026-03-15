"""
Bank reconciliation engine.
Auto-matches imported bank transactions against internal MovimientoBancario records
using multiple matching strategies with confidence scoring.
"""
import logging
from decimal import Decimal
from datetime import timedelta
from django.db.models import Q
from django.utils import timezone

logger = logging.getLogger('api.conciliation')


class ConciliationEngine:
    """
    Auto-match imported bank transactions (TransaccionBancaria) against
    internal records (MovimientoBancario).

    Matching rules (in priority order):
    1. Exact match — same amount, date, and reference
    2. Reference match — same reference, amount within tolerance
    3. Close amount — same date range, amount within tolerance
    4. AI match — description similarity (placeholder for Claude integration)
    """

    TOLERANCE_AMOUNT = Decimal('0.01')  # Amount tolerance for fuzzy matches
    TOLERANCE_DAYS = 3  # Date tolerance in days

    def auto_match(self, importacion):
        """
        Run auto-matching on all pending transactions for an import file.
        Returns dict with match statistics.
        """
        from api.models import TransaccionBancaria, MovimientoBancario

        transacciones = TransaccionBancaria.objects.filter(
            importacion=importacion,
            estado='PENDIENTE',
        )

        stats = {'total': transacciones.count(), 'matched': 0, 'unmatched': 0}

        for txn in transacciones:
            movimientos = MovimientoBancario.objects.filter(
                cuenta=txn.cuenta_bancaria,
                conciliado=False,
            )

            match, confidence = self._find_best_match(txn, movimientos)

            if match and confidence >= Decimal('0.70'):
                txn.movimiento_match = match
                txn.confianza_match = confidence
                if confidence >= Decimal('0.95'):
                    txn.estado = 'CONCILIADA'
                    match.conciliado = True
                    match.save(update_fields=['conciliado'])
                txn.save(update_fields=['movimiento_match', 'confianza_match', 'estado'])
                stats['matched'] += 1
            else:
                stats['unmatched'] += 1

        # Update import stats
        importacion.registros_conciliados = stats['matched']
        importacion.save(update_fields=['registros_conciliados'])

        logger.info(
            'Auto-match for import %s: %d/%d matched',
            importacion.id, stats['matched'], stats['total'],
        )
        return stats

    def confirm_match(self, transaccion, usuario):
        """Manually confirm a suggested match."""
        from api.models import MovimientoBancario

        if transaccion.movimiento_match is None:
            raise ValueError('No match to confirm')

        transaccion.estado = 'CONCILIADA'
        transaccion.conciliada_por = usuario
        transaccion.fecha_conciliacion = timezone.now()
        transaccion.save(update_fields=[
            'estado', 'conciliada_por', 'fecha_conciliacion',
        ])

        mov = transaccion.movimiento_match
        mov.conciliado = True
        mov.save(update_fields=['conciliado'])

        logger.info('Manually confirmed match txn %s <-> mov %s',
                     transaccion.id, mov.id)

    def reject_match(self, transaccion):
        """Reject a suggested match and reset to pending."""
        transaccion.movimiento_match = None
        transaccion.confianza_match = Decimal('0')
        transaccion.estado = 'PENDIENTE'
        transaccion.save(update_fields=[
            'movimiento_match', 'confianza_match', 'estado',
        ])

    def exclude_transaction(self, transaccion, usuario, notas=''):
        """Mark a transaction as excluded from reconciliation."""
        transaccion.estado = 'EXCLUIDA'
        transaccion.conciliada_por = usuario
        transaccion.notas = notas
        transaccion.save(update_fields=['estado', 'conciliada_por', 'notas'])

    # -------------------------------------------------------------------------
    # Matching strategies
    # -------------------------------------------------------------------------

    def _find_best_match(self, txn, movimientos):
        """
        Try all matching strategies in priority order.
        Returns (MovimientoBancario, confidence) or (None, 0).
        """
        # Strategy 1: Exact match
        match = self._exact_match(txn, movimientos)
        if match:
            return match, Decimal('1.00')

        # Strategy 2: Reference match
        match, conf = self._reference_match(txn, movimientos)
        if match:
            return match, conf

        # Strategy 3: Close amount match
        match, conf = self._close_amount_match(txn, movimientos)
        if match:
            return match, conf

        # Strategy 4: AI/description similarity (basic implementation)
        match, conf = self._description_match(txn, movimientos)
        if match:
            return match, conf

        return None, Decimal('0')

    def _exact_match(self, txn, movimientos):
        """Rule 1: Exact amount + date + reference."""
        if not txn.referencia:
            return None

        result = movimientos.filter(
            monto=txn.monto,
            fecha=txn.fecha,
            referencia=txn.referencia,
        ).first()
        return result

    def _reference_match(self, txn, movimientos):
        """Rule 2: Same reference, amount within tolerance."""
        if not txn.referencia:
            return None, Decimal('0')

        results = movimientos.filter(
            referencia=txn.referencia,
            monto__gte=txn.monto - self.TOLERANCE_AMOUNT,
            monto__lte=txn.monto + self.TOLERANCE_AMOUNT,
        )

        if results.count() == 1:
            mov = results.first()
            # Higher confidence if date is also close
            if abs((mov.fecha - txn.fecha).days) <= self.TOLERANCE_DAYS:
                return mov, Decimal('0.95')
            return mov, Decimal('0.85')

        return None, Decimal('0')

    def _close_amount_match(self, txn, movimientos):
        """Rule 3: Same date range, exact amount."""
        fecha_min = txn.fecha - timedelta(days=self.TOLERANCE_DAYS)
        fecha_max = txn.fecha + timedelta(days=self.TOLERANCE_DAYS)

        results = movimientos.filter(
            monto=txn.monto,
            fecha__gte=fecha_min,
            fecha__lte=fecha_max,
        )

        if results.count() == 1:
            return results.first(), Decimal('0.80')

        return None, Decimal('0')

    def _description_match(self, txn, movimientos):
        """Rule 4: Description similarity (basic keyword matching)."""
        if not txn.descripcion:
            return None, Decimal('0')

        # Extract meaningful words from the transaction description
        words = [w.lower() for w in txn.descripcion.split() if len(w) > 3]
        if not words:
            return None, Decimal('0')

        fecha_min = txn.fecha - timedelta(days=self.TOLERANCE_DAYS * 2)
        fecha_max = txn.fecha + timedelta(days=self.TOLERANCE_DAYS * 2)

        # Filter by amount and date range
        candidates = movimientos.filter(
            monto__gte=txn.monto - self.TOLERANCE_AMOUNT,
            monto__lte=txn.monto + self.TOLERANCE_AMOUNT,
            fecha__gte=fecha_min,
            fecha__lte=fecha_max,
        )

        best_match = None
        best_score = 0

        for mov in candidates:
            desc_lower = (mov.descripcion or '').lower()
            matches = sum(1 for w in words if w in desc_lower)
            score = matches / len(words) if words else 0

            if score > best_score:
                best_score = score
                best_match = mov

        if best_match and best_score >= 0.5:
            confidence = Decimal(str(min(0.75, 0.5 + best_score * 0.25)))
            return best_match, confidence

        return None, Decimal('0')
