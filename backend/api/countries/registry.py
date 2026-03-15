from typing import Dict, Optional
from .base import CountryConfig


class CountryRegistry:
    """Registry pattern for country configurations."""
    _registry: Dict[str, CountryConfig] = {}

    @classmethod
    def register(cls, config: CountryConfig):
        cls._registry[config.code] = config

    @classmethod
    def get(cls, code: str) -> Optional[CountryConfig]:
        return cls._registry.get(code)

    @classmethod
    def get_or_raise(cls, code: str) -> CountryConfig:
        config = cls.get(code)
        if not config:
            raise ValueError(f"Country '{code}' not registered. Available: {list(cls._registry.keys())}")
        return config

    @classmethod
    def all(cls) -> Dict[str, CountryConfig]:
        return cls._registry.copy()

    @classmethod
    def available_codes(cls) -> list:
        return list(cls._registry.keys())
