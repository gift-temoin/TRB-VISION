"""Test-wide configuration.

The application services read a module-level ``settings`` singleton that is
built from ``.env``. To keep the test-suite deterministic regardless of how a
developer has configured their ``.env`` (e.g. a real data provider), we pin the
singleton to safe demo/no-vision defaults here, before the app is imported.
"""
from app.config import settings

settings.database_url = "sqlite://"
settings.demo_mode = True
settings.market_data_provider = "none"
settings.market_data_api_key = ""
settings.forex_provider = ""
settings.forex_api_key = ""
settings.vision_provider = "none"
settings.vision_api_key = ""
