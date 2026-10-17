from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# Providers that serve public data without an API key.
KEYLESS_PROVIDERS = {"yahoo"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Core
    database_url: str = "sqlite:///./trb.db"
    secret_key: str = "dev-secret-change-me"
    access_token_expire_minutes: int = 1440
    algorithm: str = "HS256"

    cors_origins: str = "http://localhost:5173"

    # Admin bootstrap
    admin_email: str = "admin@trb.local"
    admin_password: str = "ChangeMe123!"
    admin_full_name: str = "TRB Administrator"
    admin_country: str = "KE"

    # Verification
    verification_max_attempts: int = 5
    verification_lock_minutes: int = 15

    # Market data
    market_data_provider: str = "none"
    market_data_api_key: str = ""
    demo_mode: bool = True

    # Chart screenshot analysis (optional vision model)
    vision_provider: str = "none"
    vision_api_key: str = ""
    vision_model: str = "gpt-4o-mini"
    vision_base_url: str = "https://api.openai.com/v1"

    # Forex OHLC / trend analysis
    # When left empty these fall back to the MARKET_DATA_* values above.
    forex_provider: str = ""
    forex_api_key: str = ""
    forex_symbol: str = "EUR/USD"
    forex_default_interval: str = "H1"
    forex_history: int = 500
    forex_stale_minutes: int = 240
    forex_eval_train_ratio: float = 0.7

    # Messaging
    message_rate_limit_per_minute: int = 20

    # WhatsApp
    whatsapp_enabled: bool = False
    whatsapp_phone_number: str = ""

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def provider_configured(self) -> bool:
        provider = self.market_data_provider.lower()
        if provider in ("", "none"):
            return False
        if provider in KEYLESS_PROVIDERS:
            return True
        return bool(self.market_data_api_key)

    @property
    def vision_configured(self) -> bool:
        return self.vision_provider.lower() not in ("", "none") and bool(self.vision_api_key)

    @property
    def effective_forex_provider(self) -> str:
        return (self.forex_provider or self.market_data_provider).lower()

    @property
    def effective_forex_api_key(self) -> str:
        return self.forex_api_key or self.market_data_api_key

    @property
    def forex_configured(self) -> bool:
        provider = self.effective_forex_provider
        if provider in ("", "none"):
            return False
        if provider in KEYLESS_PROVIDERS:
            return True
        return bool(self.effective_forex_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
