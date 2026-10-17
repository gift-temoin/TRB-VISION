"""Market data provider abstraction.

Real providers are only used when configured with an API key on the server. When
no provider is configured the service either returns UNAVAILABLE or, in demo
mode, clearly-labelled SAMPLE data. It never presents invented data as live.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import httpx

from ..config import settings
from ..schemas import MarketQuoteOut, SeriesPoint

SAMPLE_SOURCE = "Sample data (demo — not live)"


@dataclass(frozen=True)
class Instrument:
    symbol: str
    name: str
    category: str
    quote_currency: str
    provider_symbol: str


INSTRUMENTS: dict[str, List[Instrument]] = {
    "forex": [
        Instrument("EURUSD", "Euro / US Dollar", "forex", "USD", "EUR/USD"),
        Instrument("GBPUSD", "British Pound / US Dollar", "forex", "USD", "GBP/USD"),
        Instrument("USDJPY", "US Dollar / Japanese Yen", "forex", "JPY", "USD/JPY"),
        Instrument("AUDUSD", "Australian Dollar / US Dollar", "forex", "USD", "AUD/USD"),
    ],
    "gold": [
        Instrument("XAUUSD", "Gold / US Dollar", "gold", "USD", "XAU/USD"),
        Instrument("XAGUSD", "Silver / US Dollar", "gold", "USD", "XAG/USD"),
    ],
    "crypto": [
        Instrument("BTCUSD", "Bitcoin / US Dollar", "crypto", "USD", "BTC/USD"),
        Instrument("ETHUSD", "Ethereum / US Dollar", "crypto", "USD", "ETH/USD"),
    ],
    "binary": [
        Instrument("EURUSD", "Euro / US Dollar", "binary", "USD", "EUR/USD"),
        Instrument("XAUUSD", "Gold / US Dollar", "binary", "USD", "XAU/USD"),
        Instrument("BTCUSD", "Bitcoin / US Dollar", "binary", "USD", "BTC/USD"),
    ],
}

TIMEFRAMES = ["M15", "H1", "H4", "D1"]
HORIZONS = ["1h", "4h", "1d"]


def instruments_for(category: Optional[str] = None) -> List[Instrument]:
    if category:
        return INSTRUMENTS.get(category, [])
    return [i for group in INSTRUMENTS.values() for i in group]


def _seed_for(symbol: str) -> int:
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return int(hashlib.sha256(f"{symbol}:{day}".encode()).hexdigest()[:8], 16)


_BASE_PRICES = {
    "EURUSD": 1.085,
    "GBPUSD": 1.265,
    "USDJPY": 149.3,
    "AUDUSD": 0.658,
    "XAUUSD": 2350.0,
    "XAGUSD": 28.5,
    "BTCUSD": 64000.0,
    "ETHUSD": 3100.0,
}


def _sample_series(symbol: str, points: int = 96) -> List[SeriesPoint]:
    rng = random.Random(_seed_for(symbol))
    base = _BASE_PRICES.get(symbol, 100.0)
    vol = base * 0.004
    price = base
    now = datetime.now(timezone.utc)
    out: List[SeriesPoint] = []
    drift = rng.uniform(-0.15, 0.15) * vol
    for i in range(points):
        price += drift + rng.gauss(0, vol)
        price = max(price, base * 0.5)
        t = now - timedelta(minutes=(points - i) * 15)
        out.append(SeriesPoint(t=t, c=round(price, 5)))
    return out


class MarketDataService:
    def __init__(self) -> None:
        self.provider = settings.market_data_provider.lower()
        self.api_key = settings.market_data_api_key
        self.demo = settings.demo_mode

    @property
    def configured(self) -> bool:
        return settings.provider_configured

    @property
    def provider_name(self) -> str:
        if self.configured:
            return {
                "twelvedata": "Twelve Data",
                "alphavantage": "Alpha Vantage",
                "finnhub": "Finnhub",
                "yahoo": "Yahoo Finance",
            }.get(self.provider, self.provider.title())
        return "No live provider configured"

    def _fetch_series(self, inst: Instrument, points: int) -> Optional[List[SeriesPoint]]:
        """Return genuine series points, or None if unavailable."""
        if not self.configured:
            return None
        try:
            if self.provider == "twelvedata":
                return self._twelvedata_series(inst, points)
            if self.provider == "alphavantage":
                return self._alphavantage_series(inst, points)
            if self.provider == "finnhub":
                return self._finnhub_series(inst, points)
            if self.provider == "yahoo":
                return self._yahoo_series(inst, points)
        except (httpx.HTTPError, KeyError, ValueError, TypeError):
            return None
        except Exception:  # noqa: BLE001 - provider errors must never break the page
            return None
        return None

    def _yahoo_series(self, inst: Instrument, points: int) -> List[SeriesPoint]:
        # Lazy import to avoid a circular import (forex_data imports SAMPLE_SOURCE
        # from this module).
        from .forex_data import fetch_candles

        candles = fetch_candles(inst.provider_symbol, "M15", points)
        return [SeriesPoint(t=c.ts, c=c.close) for c in candles]

    def _twelvedata_series(self, inst: Instrument, points: int) -> List[SeriesPoint]:
        url = "https://api.twelvedata.com/time_series"
        params = {
            "symbol": inst.provider_symbol,
            "interval": "15min",
            "outputsize": points,
            "apikey": self.api_key,
        }
        r = httpx.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("status") == "error":
            raise ValueError(data.get("message", "provider error"))
        values = data["values"]
        return [
            SeriesPoint(t=datetime.fromisoformat(v["datetime"]).replace(tzinfo=timezone.utc), c=float(v["close"]))
            for v in reversed(values)
        ]

    def _alphavantage_series(self, inst: Instrument, points: int) -> List[SeriesPoint]:
        base, quote = inst.provider_symbol.split("/")
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "FX_INTRADAY",
            "from_symbol": base,
            "to_symbol": quote,
            "interval": "15min",
            "outputsize": "compact",
            "apikey": self.api_key,
        }
        r = httpx.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        series_key = next((k for k in data if "Time Series" in k), None)
        if not series_key:
            raise ValueError("provider error")
        rows = list(data[series_key].items())[:points]
        return [
            SeriesPoint(
                t=datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc),
                c=float(v["4. close"]),
            )
            for ts, v in reversed(rows)
        ]

    def _finnhub_series(self, inst: Instrument, points: int) -> List[SeriesPoint]:
        symbol = inst.provider_symbol.replace("/", "")
        now = int(datetime.now(timezone.utc).timestamp())
        start = now - points * 15 * 60 * 3
        url = "https://finnhub.io/api/v1/forex/candle"
        params = {
            "symbol": symbol,
            "resolution": "15",
            "from": start,
            "to": now,
            "token": self.api_key,
        }
        r = httpx.get(url, params=params, timeout=10)
        r.raise_for_status()
        data = r.json()
        if data.get("s") != "ok":
            raise ValueError("provider error")
        return [
            SeriesPoint(t=datetime.fromtimestamp(t, timezone.utc), c=float(c))
            for t, c in zip(data["t"], data["c"])
        ]

    def get_quote(self, inst: Instrument) -> MarketQuoteOut:
        series = self._fetch_series(inst, 96)
        if series and len(series) >= 2:
            prices = [p.c for p in series]
            last = prices[-1]
            first = prices[0]
            change_abs = last - first
            change_pct = (change_abs / first * 100) if first else 0.0
            as_of = series[-1].t
            # Genuine data is always shown; ``stale`` is an informational flag only
            # (markets close on weekends, so a fresh-only gate would falsely report
            # real instruments as "unavailable").
            stale = (datetime.now(timezone.utc) - as_of) > timedelta(hours=6)
            return MarketQuoteOut(
                symbol=inst.symbol,
                price=last,
                change_abs=round(change_abs, 6),
                change_pct=round(change_pct, 3),
                day_open=first,
                day_high=max(prices),
                day_low=min(prices),
                source=self.provider_name,
                as_of=as_of,
                stale=stale,
                available=True,
                series=series[-48:],
            )

        if self.demo:
            series = _sample_series(inst.symbol)
            prices = [p.c for p in series]
            last, first = prices[-1], prices[0]
            change_abs = last - first
            change_pct = (change_abs / first * 100) if first else 0.0
            return MarketQuoteOut(
                symbol=inst.symbol,
                price=last,
                change_abs=round(change_abs, 6),
                change_pct=round(change_pct, 3),
                day_open=first,
                day_high=max(prices),
                day_low=min(prices),
                source=SAMPLE_SOURCE,
                as_of=series[-1].t,
                stale=False,
                available=True,
                series=series[-48:],
            )

        return MarketQuoteOut(
            symbol=inst.symbol,
            price=None,
            change_abs=None,
            change_pct=None,
            day_open=None,
            day_high=None,
            day_low=None,
            source="Unavailable",
            as_of=None,
            stale=True,
            available=False,
            series=[],
        )

    def get_series(self, inst: Instrument, points: int = 96) -> Optional[List[SeriesPoint]]:
        series = self._fetch_series(inst, points)
        if series:
            return series
        if self.demo:
            return _sample_series(inst.symbol, points)
        return None


market_data = MarketDataService()
