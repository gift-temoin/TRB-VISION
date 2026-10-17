"""Genuine Forex OHLC data provider abstraction.

Providers are only contacted when configured with an API key in the server
environment. The module returns raw candles; validation happens separately in
``candle_validation``. When no provider is configured the service can return
clearly-labelled SAMPLE candles (demo mode only) which are flagged
``is_real=False`` so they are never presented as live.
"""
from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import httpx

from ..config import settings
from .market_data import SAMPLE_SOURCE


class ProviderError(Exception):
    """Raised when a provider request fails or returns an unusable payload."""


class IntervalUnsupported(Exception):
    """Raised when a provider does not support the requested interval."""


@dataclass(frozen=True)
class IntervalSpec:
    code: str
    label: str
    minutes: int
    twelvedata: Optional[str]
    alphavantage: Optional[str]
    alphavantage_daily: bool
    finnhub: Optional[str]


# Canonical intervals used across the API (matches market_data.TIMEFRAMES + M30).
INTERVAL_SPECS: Dict[str, IntervalSpec] = {
    "M1": IntervalSpec("M1", "1 minute", 1, "1min", "1min", False, "1"),
    "M5": IntervalSpec("M5", "5 minutes", 5, "5min", "5min", False, "5"),
    "M15": IntervalSpec("M15", "15 minutes", 15, "15min", "15min", False, "15"),
    "M30": IntervalSpec("M30", "30 minutes", 30, "30min", "30min", False, "30"),
    "H1": IntervalSpec("H1", "1 hour", 60, "1h", "60min", False, "60"),
    "H4": IntervalSpec("H4", "4 hours", 240, "4h", None, False, "240"),
    "D1": IntervalSpec("D1", "1 day", 1440, "1day", None, True, "D"),
}

INTERVAL_LABELS: Dict[str, str] = {
    "M1": "1 minute",
    "M5": "5 minutes",
    "M15": "15 minutes",
    "M30": "30 minutes",
    "H1": "1 hour",
    "H4": "4 hours",
    "D1": "1 day",
}

SUPPORTED_INTERVALS: List[str] = list(INTERVAL_SPECS.keys())

PROVIDER_NAMES = {
    "twelvedata": "Twelve Data",
    "alphavantage": "Alpha Vantage",
    "finnhub": "Finnhub",
    "yahoo": "Yahoo Finance",
}

# Providers that need no API key (keyless, public endpoints).
KEYLESS_PROVIDERS = {"yahoo"}


@dataclass(frozen=True)
class Candle:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    source: str
    is_real: bool


def normalize_interval(value: Optional[str]) -> str:
    if not value:
        return settings.forex_default_interval.upper()
    code = value.upper()
    return code if code in INTERVAL_SPECS else settings.forex_default_interval.upper()


def provider_name(provider: str) -> str:
    return PROVIDER_NAMES.get(provider, provider.title() if provider else "No live provider configured")


def interval_minutes(code: str) -> int:
    return INTERVAL_SPECS[normalize_interval(code)].minutes


# --------------------------------------------------------------------------- #
# Provider APIs
# --------------------------------------------------------------------------- #
def _http_get(url: str, params: dict) -> dict:
    try:
        response = httpx.get(url, params=params, timeout=15)
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:  # network / status
        raise ProviderError(f"Network error contacting provider: {exc}") from exc
    except ValueError as exc:  # bad JSON
        raise ProviderError("Provider returned an unreadable response.") from exc


def _parse_ts(raw: str) -> datetime:
    text = str(raw).replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        try:
            dt = datetime.strptime(str(raw)[:19], "%Y-%m-%d %H:%M:%S")
        except ValueError as exc:
            raise ProviderError(f"Provider returned an invalid timestamp: {raw!r}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _twelvedata(symbol: str, spec: IntervalSpec, outputsize: int, api_key: str) -> List[Candle]:
    if not spec.twelvedata:
        raise IntervalUnsupported(f"Twelve Data does not support interval {spec.code}.")
    data = _http_get(
        "https://api.twelvedata.com/time_series",
        {
            "symbol": symbol,
            "interval": spec.twelvedata,
            "outputsize": outputsize,
            "order": "ASC",
            "apikey": api_key,
        },
    )
    if data.get("status") == "error":
        raise ProviderError(data.get("message", "provider error"))
    values = data.get("values")
    if not values:
        raise ProviderError("Provider returned no candle data.")
    return [
        Candle(
            ts=_parse_ts(v["datetime"]),
            open=float(v["open"]),
            high=float(v["high"]),
            low=float(v["low"]),
            close=float(v["close"]),
            source=PROVIDER_NAMES["twelvedata"],
            is_real=True,
        )
        for v in values
    ]


def _alphavantage(symbol: str, spec: IntervalSpec, outputsize: int, api_key: str) -> List[Candle]:
    if "/" not in symbol:
        raise ProviderError("Alpha Vantage requires a BASE/QUOTE symbol such as EUR/USD.")
    base, quote = symbol.split("/", 1)
    if spec.alphavantage_daily:
        params = {
            "function": "FX_DAILY",
            "from_symbol": base,
            "to_symbol": quote,
            "outputsize": "full" if outputsize > 100 else "compact",
            "apikey": api_key,
        }
    else:
        if not spec.alphavantage:
            raise IntervalUnsupported(f"Alpha Vantage does not support interval {spec.code}.")
        params = {
            "function": "FX_INTRADAY",
            "from_symbol": base,
            "to_symbol": quote,
            "interval": spec.alphavantage,
            "outputsize": "full" if outputsize > 100 else "compact",
            "apikey": api_key,
        }
    data = _http_get("https://www.alphavantage.co/query", params)
    if "Note" in data or "Information" in data:
        raise ProviderError(data.get("Note") or data.get("Information"))
    if "Error Message" in data:
        raise ProviderError(data["Error Message"])
    series_key = next((k for k in data if "Time Series" in k), None)
    if not series_key:
        raise ProviderError("Provider returned no candle data.")
    rows = list(data[series_key].items())
    rows.sort(key=lambda kv: kv[0])
    out: List[Candle] = []
    for ts, v in rows[-outputsize:]:
        out.append(
            Candle(
                ts=_parse_ts(ts),
                open=float(v["1. open"]),
                high=float(v["2. high"]),
                low=float(v["3. low"]),
                close=float(v["4. close"]),
                source=PROVIDER_NAMES["alphavantage"],
                is_real=True,
            )
        )
    if not out:
        raise ProviderError("Provider returned no candle data.")
    return out


def _finnhub(symbol: str, spec: IntervalSpec, outputsize: int, api_key: str) -> List[Candle]:
    if not spec.finnhub:
        raise IntervalUnsupported(f"Finnhub does not support interval {spec.code}.")
    pair = symbol.replace("/", "")
    now = datetime.now(timezone.utc)
    start = now - timedelta(minutes=spec.minutes * (outputsize + 5))
    data = _http_get(
        "https://finnhub.io/api/v1/forex/candle",
        {
            "symbol": pair,
            "resolution": spec.finnhub,
            "from": int(start.timestamp()),
            "to": int(now.timestamp()),
            "token": api_key,
        },
    )
    if data.get("s") != "ok":
        raise ProviderError("Provider returned no candle data.")
    o, h, l, c, t = data["o"], data["h"], data["l"], data["c"], data["t"]
    return [
        Candle(
            ts=datetime.fromtimestamp(ts, timezone.utc),
            open=float(o[i]),
            high=float(h[i]),
            low=float(l[i]),
            close=float(c[i]),
            source=PROVIDER_NAMES["finnhub"],
            is_real=True,
        )
        for i, ts in enumerate(t)
    ]


# --------------------------------------------------------------------------- #
# Yahoo Finance (keyless public chart endpoint; no numpy/pandas dependency)
# --------------------------------------------------------------------------- #
_YAHOO_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)

_YAHOO_SYMBOL_MAP = {
    "EUR/USD": "EURUSD=X",
    "GBP/USD": "GBPUSD=X",
    "USD/JPY": "USDJPY=X",
    "AUD/USD": "AUDUSD=X",
    "USD/CHF": "USDCHF=X",
    "USD/CAD": "USDCAD=X",
    "NZD/USD": "NZDUSD=X",
    "EUR/GBP": "EURGBP=X",
    "EUR/JPY": "EURJPY=X",
    "GBP/JPY": "GBPJPY=X",
    "XAU/USD": "GC=F",
    "XAG/USD": "SI=F",
    "BTC/USD": "BTC-USD",
    "ETH/USD": "ETH-USD",
    "SOL/USD": "SOL-USD",
}

_YAHOO_INTERVALS = {
    "M1": "1m",
    "M5": "5m",
    "M15": "15m",
    "M30": "30m",
    "H1": "60m",
    "H4": "60m",  # resampled from hourly (Yahoo has no native 4h)
    "D1": "1d",
}

# (label, days covered) ascending — used to pick the smallest adequate window.
_YAHOO_RANGES = [
    ("1d", 1),
    ("5d", 5),
    ("1mo", 31),
    ("3mo", 92),
    ("6mo", 183),
    ("1y", 366),
    ("2y", 732),
    ("5y", 1830),
    ("10y", 3660),
]


def _yahoo_symbol(symbol: str) -> str:
    mapped = _YAHOO_SYMBOL_MAP.get(symbol.upper())
    if mapped:
        return mapped
    if "/" in symbol:
        base, quote = symbol.split("/", 1)
        return f"{base}{quote}=X"
    return symbol


def _yahoo_range(spec: IntervalSpec, count: int) -> str:
    days = math.ceil(spec.minutes * (count + 5) / 1440) + 1
    for label, covered in _YAHOO_RANGES:
        if days <= covered:
            return label
    return "10y"


def _resample(candles: List[Candle], factor: int) -> List[Candle]:
    """Aggregate consecutive candles into ``factor``-wide OHLC buckets (UTC-aligned)."""
    buckets: Dict[int, List[Candle]] = {}
    order: List[int] = []
    width = factor * 60 * 60
    for candle in candles:
        key = int(candle.ts.timestamp()) // width
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(candle)
    out: List[Candle] = []
    for key in order:
        group = buckets[key]
        out.append(
            Candle(
                ts=group[0].ts,
                open=group[0].open,
                high=max(c.high for c in group),
                low=min(c.low for c in group),
                close=group[-1].close,
                source=PROVIDER_NAMES["yahoo"],
                is_real=True,
            )
        )
    return out


def _yahoo(symbol: str, spec: IntervalSpec, outputsize: int, api_key: str) -> List[Candle]:
    ysym = _yahoo_symbol(symbol)
    yinterval = _YAHOO_INTERVALS.get(spec.code)
    if not yinterval:
        raise IntervalUnsupported(f"Yahoo Finance does not support interval {spec.code}.")
    need = outputsize * (4 if spec.code == "H4" else 1)
    rng = _yahoo_range(spec, need)
    try:
        response = httpx.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{ysym}",
            params={"interval": yinterval, "range": rng, "includePrePost": "false"},
            headers={"User-Agent": _YAHOO_UA, "Accept": "application/json"},
            timeout=20,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError as exc:
        raise ProviderError(f"Network error contacting Yahoo Finance: {exc}") from exc
    except ValueError as exc:
        raise ProviderError("Yahoo Finance returned an unreadable response.") from exc

    chart = data.get("chart") or {}
    if chart.get("error"):
        raise ProviderError(f"Yahoo Finance error: {chart['error']}")
    results = chart.get("result") or []
    if not results:
        raise ProviderError(f"Yahoo Finance returned no data for {symbol}.")
    result = results[0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    opens = quote.get("open") or []
    highs = quote.get("high") or []
    lows = quote.get("low") or []
    closes = quote.get("close") or []

    out: List[Candle] = []
    for i, ts in enumerate(timestamps):
        if i >= len(opens) or i >= len(highs) or i >= len(lows) or i >= len(closes):
            break
        o, h, l, c = opens[i], highs[i], lows[i], closes[i]
        if None in (o, h, l, c):
            continue
        out.append(
            Candle(
                ts=datetime.fromtimestamp(ts, timezone.utc),
                open=float(o),
                high=float(h),
                low=float(l),
                close=float(c),
                source=PROVIDER_NAMES["yahoo"],
                is_real=True,
            )
        )
    if spec.code == "H4":
        out = _resample(out, 4)
    if not out:
        raise ProviderError(f"Yahoo Finance returned no usable candles for {symbol}.")
    return out[-outputsize:]


_PROVIDER_FETCHERS = {
    "twelvedata": _twelvedata,
    "alphavantage": _alphavantage,
    "finnhub": _finnhub,
    "yahoo": _yahoo,
}


# --------------------------------------------------------------------------- #
# Sample data (clearly labelled, never live)
# --------------------------------------------------------------------------- #
_SAMPLE_BASE = {"EUR/USD": 1.0850, "GBP/USD": 1.2650, "USD/JPY": 149.30, "AUD/USD": 0.6580}


def _sample_candles(symbol: str, spec: IntervalSpec, count: int) -> List[Candle]:
    seed = int(
        hashlib.sha256(f"{symbol}:{spec.code}:sample".encode()).hexdigest()[:8], 16
    )
    rng = random.Random(seed)
    base = _SAMPLE_BASE.get(symbol, 1.0)
    vol = base * 0.0025
    price = base
    now = datetime.now(timezone.utc)
    # Align the newest candle to the interval boundary, then step backwards.
    step = timedelta(minutes=spec.minutes)
    latest = now - (now - datetime(1970, 1, 1, tzinfo=timezone.utc)) % step
    out: List[Candle] = []
    prices: List[tuple] = []
    for i in range(count):
        drift = rng.gauss(0, vol * 0.25)
        open_ = price
        close = max(price + drift, base * 0.5)
        high = max(open_, close) + abs(rng.gauss(0, vol * 0.5))
        low = min(open_, close) - abs(rng.gauss(0, vol * 0.5))
        prices.append((open_, high, low, close))
        price = close
    start = latest - step * (count - 1)
    for i, (open_, high, low, close) in enumerate(prices):
        out.append(
            Candle(
                ts=start + step * i,
                open=round(open_, 5),
                high=round(high, 5),
                low=round(low, 5),
                close=round(close, 5),
                source=SAMPLE_SOURCE,
                is_real=False,
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Public fetch
# --------------------------------------------------------------------------- #
def fetch_candles(
    symbol: str, interval: str, outputsize: Optional[int] = None
) -> List[Candle]:
    """Fetch raw candles from the configured provider, or sample data in demo mode.

    Raises ``ProviderError`` when configured but unusable, or when no provider is
    configured and demo mode is off.
    """
    spec = INTERVAL_SPECS[normalize_interval(interval)]
    size = outputsize or settings.forex_history
    if settings.forex_configured:
        fetcher = _PROVIDER_FETCHERS.get(settings.effective_forex_provider)
        if fetcher is None:
            raise ProviderError(
                f"Unknown provider {settings.effective_forex_provider!r}. "
                "Supported: twelvedata, alphavantage, finnhub."
            )
        return fetcher(symbol, spec, size, settings.effective_forex_api_key)
    if settings.demo_mode:
        return _sample_candles(symbol, spec, min(size, 400))
    raise ProviderError(
        "No live Forex data provider is configured. Set FOREX_PROVIDER and "
        "FOREX_API_KEY (or enable DEMO_MODE for clearly-labelled sample data)."
    )
