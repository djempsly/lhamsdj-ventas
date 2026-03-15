"""
Circuit Breaker instances for external service integrations.
Uses pybreaker to protect against cascading failures.
"""
import pybreaker
import logging
import time

logger = logging.getLogger('api.circuit_breakers')


# =============================================================================
# LISTENERS
# =============================================================================

class CircuitBreakerLogger(pybreaker.CircuitBreakerListener):
    """Log circuit breaker state changes."""

    def state_change(self, cb, old_state, new_state):
        logger.warning(
            'Circuit breaker "%s" changed from %s to %s',
            cb.name, old_state.name, new_state.name,
        )

    def failure(self, cb, exc):
        logger.error(
            'Circuit breaker "%s" recorded failure: %s', cb.name, exc,
        )

    def success(self, cb):
        logger.debug('Circuit breaker "%s" call succeeded.', cb.name)


_listener = CircuitBreakerLogger()


# =============================================================================
# CIRCUIT BREAKER INSTANCES
# =============================================================================

# DGII (Dirección General de Impuestos Internos) — fiscal API
dgii_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=60,
    name='DGII',
    listeners=[_listener],
)

# Claude AI — analysis/recommendations
claude_breaker = pybreaker.CircuitBreaker(
    fail_max=3,
    reset_timeout=120,
    name='Claude_AI',
    listeners=[_listener],
)

# External APIs (exchange rates, etc.)
external_api_breaker = pybreaker.CircuitBreaker(
    fail_max=5,
    reset_timeout=90,
    name='External_API',
    listeners=[_listener],
)


# =============================================================================
# REGISTRY
# =============================================================================

BREAKERS = {
    'dgii': dgii_breaker,
    'claude': claude_breaker,
    'external': external_api_breaker,
}


def get_all_status():
    """Return status of all circuit breakers for health endpoint."""
    result = {}
    for key, cb in BREAKERS.items():
        result[key] = {
            'name': cb.name,
            'state': cb.current_state,
            'fail_count': cb.fail_counter,
            'fail_max': cb.fail_max,
            'reset_timeout': cb.reset_timeout,
        }
    return result


def reset_breaker(name):
    """Manually reset a circuit breaker."""
    cb = BREAKERS.get(name)
    if cb:
        cb.close()
        logger.info('Circuit breaker "%s" manually reset.', name)
        return True
    return False
