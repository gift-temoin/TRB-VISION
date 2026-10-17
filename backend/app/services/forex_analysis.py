"""Forex trend-analysis orchestrator.

Ties together data fetching, validation and indicator calculation, and produces a
complete, self-describing analysis payload (including data-source status and any
data-quality warnings). It never predicts the future or fabricates confidence.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Candle as CandleModel
from ..schemas import (
    CandleOut,
    CandleWarningOut,
    DataSourceStatusOut,
    ForexCandlesOut,
    ForexAnalysisOut,
    IndicatorInfoOut,
    IndicatorSeriesPoint,
    StructureOut,
    SwingPointOut,
)
from . import indicators as ind
from .candle_validation import ValidationResult, validate_candles
from .forex_data import (
    Candle,
    SUPPORTED_INTERVALS,
    fetch_candles,
    interval_minutes,
    normalize_interval,
    provider_name,
)
from .market_data import SAMPLE_SOURCE

DISCLAIMER = (
    "Educational trend analysis of historical data only. Indicators describe what "
    "has already happened; they do not predict the future and guarantee nothing. "
    "Not financial advice."
)

SERIES_POINTS = 240


def _is_sample(candles: Sequence[Candle]) -> bool:
    return bool(candles) and not candles[-1].is_real


def _status(
    symbol: str,
    interval: str,
    vr: ValidationResult,
    live: bool,
    sample: bool,
) -> DataSourceStatusOut:
    stale = any(w.code == "stale_data" for w in vr.warnings)
    if sample:
        provider = SAMPLE_SOURCE
        message = (
            "Demo mode: no live Forex provider is configured. These are clearly-labelled "
            "sample candles for interface preview — not live market data."
        )
    elif live:
        provider = provider_name(settings.effective_forex_provider)
        message = None
    else:
        provider = "Unavailable"
        message = "No live Forex data provider is configured and demo mode is off."
    return DataSourceStatusOut(
        provider=provider,
        is_live=live,
        is_sample=sample,
        available=bool(vr.completed),
        symbol=symbol,
        interval=interval,
        candles=len(vr.candles),
        completed_candles=len(vr.completed),
        latest_candle=vr.latest_ts,
        latest_complete_candle=vr.latest_complete_ts,
        stale=stale,
        message=message,
    )


def _candle_out(c: Candle, now: datetime, step_minutes: int) -> CandleOut:
    complete = c.ts + timedelta(minutes=step_minutes) <= now
    return CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, complete=complete)


def get_candles(symbol: str, interval: str, outputsize: Optional[int] = None) -> ForexCandlesOut:
    interval = normalize_interval(interval)
    raw = fetch_candles(symbol, interval, outputsize)
    vr = validate_candles(raw, interval)
    now = datetime.now(timezone.utc)
    sample = _is_sample(vr.candles)
    live = bool(vr.candles) and not sample
    status = _status(symbol, interval, vr, live, sample)
    return ForexCandlesOut(
        status=status,
        candles=[_candle_out(c, now, interval_minutes(interval)) for c in vr.candles],
        warnings=vr.warnings,
        available_intervals=SUPPORTED_INTERVALS,
        disclaimer=DISCLAIMER,
    )


def _fmt(value: Optional[float], digits: int) -> Optional[str]:
    if value is None:
        return None
    return f"{value:,.{digits}f}"


def _info(
    key: str,
    value: Optional[float],
    digits: int,
    zone: Optional[str] = None,
) -> IndicatorInfoOut:
    meta = ind.EXPLANATIONS[key]
    period = int(meta["window"].split(" ")[0]) if meta["window"].split(" ")[0].isdigit() else None
    return IndicatorInfoOut(
        key=key,
        name=meta["name"],
        period=period,
        value=value,
        display=_fmt(value, digits),
        zone=zone if value is not None else None,
        what=meta["what"],
        how=meta["how"],
        contributes=meta["contributes"],
        ready=value is not None,
    )


def _zone_rsi(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value >= 70:
        return "overbought"
    if value <= 30:
        return "oversold"
    return "neutral"


def _zone_adx(value: Optional[float]) -> Optional[str]:
    if value is None:
        return None
    if value >= 25:
        return "trending"
    if value < 20:
        return "ranging"
    return "transitional"


def _build_structure(
    swings, closes: Sequence[float], times: Sequence[datetime]
) -> StructureOut:
    high_swings = [s for s in swings if s[0] == "HIGH"]
    low_swings = [s for s in swings if s[0] == "LOW"]

    def to_out(s) -> Optional[SwingPointOut]:
        if s is None:
            return None
        kind, idx, price = s
        ts = times[idx] if 0 <= idx < len(times) else (times[-1] if times else datetime.now(timezone.utc))
        return SwingPointOut(kind=kind, index=idx, ts=ts, price=price)

    last_high = high_swings[-1] if high_swings else None
    last_low = low_swings[-1] if low_swings else None
    current = closes[-1] if closes else None

    resistance = None
    if current is not None:
        above = [h[2] for h in high_swings if h[2] > current]
        resistance = min(above) if above else (last_high[2] if last_high else None)
    support = None
    if current is not None:
        below = [l[2] for l in low_swings if l[2] < current]
        support = max(below) if below else (last_low[2] if last_low else None)

    trend = _classify_trend(closes, swings)
    return StructureOut(
        trend=trend,
        last_swing_high=to_out(last_high),
        last_swing_low=to_out(last_low),
        nearest_resistance=resistance,
        nearest_support=support,
        summary=ind.structure_summary(swings),
    )


def _classify_trend(closes: Sequence[float], swings) -> str:
    if len(closes) < 50:
        return "UNKNOWN"
    e20 = ind.latest_defined(ind.ema(closes, 20))
    e50 = ind.latest_defined(ind.ema(closes, 50))
    if e20 is None or e50 is None:
        return "UNKNOWN"
    if e20 > e50 * 1.0005:
        return "UP"
    if e20 < e50 * 0.9995:
        return "DOWN"
    return "RANGE"


def get_analysis(symbol: str, interval: str, outputsize: Optional[int] = None) -> ForexAnalysisOut:
    interval = normalize_interval(interval)
    raw = fetch_candles(symbol, interval, outputsize)
    vr = validate_candles(raw, interval)
    return compute_analysis(symbol, interval, vr)


def compute_analysis(symbol: str, interval: str, vr: ValidationResult) -> ForexAnalysisOut:
    """Build the full analysis payload from an already-validated candle set.

    Shared by the Forex trend-analysis endpoint and ChartMind so both compute
    indicators, series and structure identically with no duplicated logic.
    """
    interval = normalize_interval(interval)
    now = datetime.now(timezone.utc)
    sample = _is_sample(vr.candles)
    live = bool(vr.candles) and not sample
    status = _status(symbol, interval, vr, live, sample)

    completed = vr.completed
    closes = [c.close for c in completed]
    highs = [c.high for c in completed]
    lows = [c.low for c in completed]

    ema20_series = ind.ema(closes, 20)
    ema50_series = ind.ema(closes, 50)
    rsi_series = ind.rsi(closes, 14)
    atr_series = ind.atr(highs, lows, closes, 14)
    adx_series, plus_di, minus_di = ind.adx(highs, lows, closes, 14)
    swings = ind.swing_points(highs, lows, 2, 2)

    ema20 = ind.latest_defined(ema20_series)
    ema50 = ind.latest_defined(ema50_series)
    rsi14 = ind.latest_defined(rsi_series)
    atr14 = ind.latest_defined(atr_series)
    adx14 = ind.latest_defined(adx_series)
    pdi = ind.latest_defined(plus_di)
    mdi = ind.latest_defined(minus_di)

    info: List[IndicatorInfoOut] = [
        _info("ema20", ema20, 5),
        _info("ema50", ema50, 5),
        _info("rsi14", rsi14, 1, _zone_rsi(rsi14)),
        _info("adx14", adx14, 1, _zone_adx(adx14)),
        _info("atr14", atr14, 5),
    ]
    # Attach directional context to ADX display for clarity.
    if adx14 is not None and pdi is not None and mdi is not None:
        direction = "upward pressure" if pdi >= mdi else "downward pressure"
        info[3].zone = f"{info[3].zone} · {direction}" if info[3].zone else direction

    # Indicator series aligned to completed candles (for chart overlay).
    series: List[IndicatorSeriesPoint] = []
    start = max(0, len(completed) - SERIES_POINTS)
    for i in range(start, len(completed)):
        series.append(
            IndicatorSeriesPoint(
                ts=completed[i].ts,
                ema20=ema20_series[i],
                ema50=ema50_series[i],
                rsi14=rsi_series[i],
                adx14=adx_series[i],
                atr14=atr_series[i],
            )
        )

    latest_ts = completed[-1].ts if completed else None
    structure = _build_structure(swings, closes, [c.ts for c in completed])

    return ForexAnalysisOut(
        status=status,
        indicators=info,
        structure=structure,
        series=series,
        warnings=vr.warnings,
        disclaimer=DISCLAIMER,
    )


def persist_candles(db: Session, symbol: str, interval: str, candles: Sequence[Candle]) -> int:
    """Best-effort upsert of *real* validated candles. Sample data is never stored as real."""
    real = [c for c in candles if c.is_real]
    if not real:
        return 0
    stored = 0
    for c in real:
        existing = (
            db.query(CandleModel)
            .filter(
                CandleModel.symbol == symbol,
                CandleModel.interval == interval,
                CandleModel.ts == c.ts,
            )
            .one_or_none()
        )
        if existing is None:
            db.add(
                CandleModel(
                    symbol=symbol,
                    interval=interval,
                    ts=c.ts,
                    open=c.open,
                    high=c.high,
                    low=c.low,
                    close=c.close,
                    source=c.source,
                    is_real=True,
                )
            )
            stored += 1
    if stored:
        db.commit()
    return stored
