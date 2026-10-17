"""ChartMind — the "AI Chart Analyzer" analysis orchestrator.

Combines genuine, validated OHLC candles with explainable technical indicators,
swing-based support/resistance levels and price zones, and optionally augments the
result with observations read from an uploaded chart screenshot.

Design rules (deliberate, non-negotiable):
* Levels/zones and indicators are computed from **actual OHLC data only**.
* Screenshot observations are always kept clearly separate from OHLC measurements.
* No price is forecast, no accuracy is invented, and every response carries a
  plain-language disclaimer plus explicit data limitations.
* Sample/demo candles are labelled as such and never presented as live.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple

from ..schemas import (
    ChartLevelOut,
    ChartMindResultOut,
    CandleOut,
    DemandZoneOut,
    FutureMarkerOut,
    IndicatorInfoOut,
    IndicatorSeriesPoint,
    PipelineStageOut,
    PriceZoneOut,
    ScreenshotLevelOut,
    ScreenshotObservationOut,
    SwingPointOut,
    TradePlanOut,
)
from . import indicators as ind
from .candle_validation import ValidationResult, validate_candles
from .chart_analysis import VisionRead, analyze_chart, read_chart
from .forex_analysis import (
    SERIES_POINTS,
    _build_structure,
    _info,
    _is_sample,
    _status,
    _zone_adx,
    _zone_rsi,
)
from .forex_data import (
    Candle,
    fetch_candles,
    interval_minutes,
    normalize_interval,
    provider_name,
)

MIND_DISCLAIMER = (
    "ChartMind is an educational technical-analysis aid. It describes historical "
    "price structure and clearly-labelled indicators; it does not predict the future, "
    "does not guarantee any outcome, and does not place trades. Screenshot readings are "
    "visual estimates kept separate from measured OHLC data. Not financial advice."
)

DEFAULT_CANDLES = 100
MAX_CANDLES = 1000
MIN_CANDLES = 20
MAX_SWING_MARKERS = 24
MAX_LEVELS_PER_SIDE = 3


class ScreenshotInput:
    """Bundle of an uploaded screenshot and any hints the user provided."""

    def __init__(
        self,
        data: bytes,
        content_type: str,
        instrument_hint: Optional[str] = None,
        timeframe_hint: Optional[str] = None,
    ) -> None:
        self.data = data
        self.content_type = content_type
        self.instrument_hint = instrument_hint
        self.timeframe_hint = timeframe_hint


# --------------------------------------------------------------------------- #
# Level / zone detection (from real OHLC swing structure)
# --------------------------------------------------------------------------- #
def _cluster(points: Sequence[float], tolerance: float) -> List[Tuple[float, int]]:
    """Group nearby swing prices into levels. Returns [(mean_price, touches)]."""
    if not points:
        return []
    pts = sorted(points)
    tolerance = tolerance if tolerance > 0 else 1e-9
    clusters: List[List[float]] = [[pts[0]]]
    for p in pts[1:]:
        if p - clusters[-1][-1] <= tolerance:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return [(sum(c) / len(c), len(c)) for c in clusters]


def _strength(touches: int) -> str:
    if touches >= 3:
        return "strong"
    if touches == 2:
        return "moderate"
    return "weak"


def _build_levels(
    close: Optional[float],
    swings: Sequence[Tuple[str, int, float]],
    tolerance: float,
) -> Tuple[List[ChartLevelOut], List[PriceZoneOut]]:
    high_prices = [s[2] for s in swings if s[0] == "HIGH"]
    low_prices = [s[2] for s in swings if s[0] == "LOW"]

    resistance_clusters = _cluster(high_prices, tolerance)
    support_clusters = _cluster(low_prices, tolerance)

    if close is not None:
        # Nearest above the current price first; then the next ones.
        resistance_clusters = sorted(
            [c for c in resistance_clusters if c[0] > close], key=lambda c: c[0]
        )[:MAX_LEVELS_PER_SIDE]
        support_clusters = sorted(
            [c for c in support_clusters if c[0] < close], key=lambda c: -c[0]
        )[:MAX_LEVELS_PER_SIDE]
    else:
        resistance_clusters = sorted(resistance_clusters, key=lambda c: -c[0])[:MAX_LEVELS_PER_SIDE]
        support_clusters = sorted(support_clusters, key=lambda c: c[0])[:MAX_LEVELS_PER_SIDE]

    levels: List[ChartLevelOut] = []
    zones: List[PriceZoneOut] = []

    def make(kind: str, clusters: List[Tuple[float, int]]) -> None:
        for price, touches in clusters:
            strength = _strength(touches)
            half = tolerance * 0.5
            if kind == "resistance":
                explanation = (
                    f"Resistance near {price:.5f} formed from {touches} swing high(s) that "
                    f"clustered within {tolerance:.5f}. Price previously turned lower from this "
                    f"area, so sellers were active here. Strength: {strength}."
                )
            else:
                explanation = (
                    f"Support near {price:.5f} formed from {touches} swing low(s) that "
                    f"clustered within {tolerance:.5f}. Price previously bounced from this area, "
                    f"so buyers were active here. Strength: {strength}."
                )
            levels.append(
                ChartLevelOut(
                    kind=kind,
                    price=price,
                    touches=touches,
                    strength=strength,
                    lower=price - half,
                    upper=price + half,
                    explanation=explanation,
                )
            )
            zones.append(
                PriceZoneOut(
                    kind=kind,
                    lower=price - half,
                    upper=price + half,
                    explanation=(
                        f"Shaded {kind} zone spanning ±0.5×ATR around the {kind} level at "
                        f"{price:.5f}. The band width reflects current volatility (ATR)."
                    ),
                )
            )

    make("resistance", resistance_clusters)
    make("support", support_clusters)
    return levels, zones


# --------------------------------------------------------------------------- #
# Risk/reward overlay + demand zone (all boundaries derived from real OHLC)
# --------------------------------------------------------------------------- #
def _atr_fallback(candles: Sequence[Candle]) -> float:
    n = min(14, len(candles))
    if n <= 0:
        return 0.0
    ranges = [c.high - c.low for c in candles[-n:]]
    return sum(ranges) / len(ranges)


def _nearest_level(levels: Sequence[ChartLevelOut], side: str, entry: float) -> Optional[ChartLevelOut]:
    if side == "support":
        pool = [l for l in levels if l.kind == "support" and l.price < entry]
        return max(pool, key=lambda l: l.price) if pool else None
    pool = [l for l in levels if l.kind == "resistance" and l.price > entry]
    return min(pool, key=lambda l: l.price) if pool else None


def _risk_dist(entry: float, level: Optional[ChartLevelOut], atr: float) -> float:
    """Volatility-scaled stop distance, pushed just beyond a nearby level when one exists."""
    floor = 0.75 * atr
    cap = 3.0 * atr
    if level is not None:
        d = abs(entry - level.price) + 0.25 * atr
        return min(max(d, floor), cap)
    return 1.5 * atr


def _build_demand_zone(
    levels: Sequence[ChartLevelOut],
) -> Optional[DemandZoneOut]:
    """Strongest measured support becomes a cyan demand zone (or resistance -> supply)."""
    supports = [l for l in levels if l.kind == "support"]
    role = "demand"
    pool = supports
    if not pool:
        pool = [l for l in levels if l.kind == "resistance"]
        role = "supply"
    if not pool:
        return None

    # Strongest cluster wins; ties break toward the level nearest the current price.
    level = max(pool, key=lambda l: (l.touches, l.price if role == "demand" else -l.price))
    lower = level.lower if level.lower is not None else level.price
    upper = level.upper if level.upper is not None else level.price
    side = "buyers (price bounced here)" if role == "demand" else "sellers (price turned lower here)"
    swing = "swing low(s)" if role == "demand" else "swing high(s)"
    explanation = (
        f"{'Demand' if role == 'demand' else 'Supply'} zone derived from {level.touches} measured "
        f"{swing} that clustered around {level.price:.5f}. Price repeatedly found {side}, so the band "
        f"{lower:.5f}–{upper:.5f} is a potential reaction area. Band width is ±0.5×ATR, reflecting "
        f"current volatility. Strength: {level.strength}."
    )
    return DemandZoneOut(
        role=role,
        lower=lower,
        upper=upper,
        price=level.price,
        touches=level.touches,
        strength=level.strength,
        explanation=explanation,
    )


def _build_trade_plan(
    trend: str,
    levels: Sequence[ChartLevelOut],
    completed: Sequence[Candle],
    closes: Sequence[float],
    atr: Optional[float],
    step_minutes: int,
    future_candles: int,
    sample: bool,
) -> Optional[TradePlanOut]:
    """Volatility-scaled risk/reward overlay in price/time coordinates (never pixels)."""
    if not completed or not closes:
        return None

    entry = closes[-1]
    atr_value = atr if (atr and atr > 0) else _atr_fallback(completed)
    if atr_value <= 0:
        rng = (max(c.high for c in completed) - min(c.low for c in completed)) if completed else 0.0
        atr_value = rng * 0.02 if rng > 0 else max(abs(entry) * 0.001, 1e-6)

    horizon = int(future_candles) if future_candles and future_candles > 0 else 20
    entry_ts = completed[-1].ts
    future_ts = entry_ts + timedelta(minutes=step_minutes * horizon)

    supports = _nearest_level(levels, "support", entry)
    resistances = _nearest_level(levels, "resistance", entry)

    notes: List[str] = [
        "Rectangles are positioned in price/time coordinates derived from your candles, so they "
        "stay aligned when the chart is zoomed, panned, or the timeframe changes.",
        "The entry is the last completed candle close; the stop and target are volatility-scaled "
        "(ATR) offsets, not forecasts. This is an educational overlay, not a trade instruction.",
    ]
    if sample:
        notes.append("Basis data is clearly-labelled SAMPLE data (demo mode), not live market data.")

    if trend == "UP":
        bias = "BULLISH"
        risk = _risk_dist(entry, supports, atr_value)
        stop = entry - risk
        target = entry + 2.0 * risk
        body_lower, body_upper = entry, target
        risk_lower, risk_upper = stop, entry
        labels = {
            "body": "Projected target range",
            "risk": "Risk / invalidation",
            "boundary": "Entry / reference",
        }
        explanation = (
            f"Uptrend read: the reference entry is {entry:.5f}. The grey box projects the target "
            f"range up to {target:.5f}; the red box marks the risk/invalidation area down to "
            f"{stop:.5f}. Risk ≈ {risk:.5f}, target ≈ {2.0 * risk:.5f} (about 1:2)."
        )
    elif trend == "DOWN":
        bias = "BEARISH"
        risk = _risk_dist(entry, resistances, atr_value)
        stop = entry + risk
        target = entry - 2.0 * risk
        body_lower, body_upper = target, entry
        risk_lower, risk_upper = entry, stop
        labels = {
            "body": "Projected target range",
            "risk": "Risk / invalidation",
            "boundary": "Entry / reference",
        }
        explanation = (
            f"Downtrend read: the reference entry is {entry:.5f}. The grey box projects the target "
            f"range down to {target:.5f}; the red box marks the risk/invalidation area up to "
            f"{stop:.5f}. Risk ≈ {risk:.5f}, target ≈ {2.0 * risk:.5f} (about 1:2)."
        )
    else:
        bias = "NEUTRAL"
        stop = entry + 1.0 * atr_value
        target = entry - 1.5 * atr_value
        body_lower, body_upper = entry - 1.5 * atr_value, entry
        risk_lower, risk_upper = entry, entry + 1.0 * atr_value
        labels = {
            "body": "Projected range",
            "risk": "Risk band",
            "boundary": "Entry / reference",
        }
        explanation = (
            f"Sideways/undecided read: no directional edge, so the overlay shows a volatility range. "
            f"The grey box spans the downside range toward {target:.5f} and the red box marks the "
            f"upside band toward {stop:.5f}, around the reference price {entry:.5f}."
        )

    reward_risk = (
        round(abs(target - entry) / abs(entry - stop), 2)
        if bias in ("BULLISH", "BEARISH") and abs(entry - stop) > 0
        else None
    )

    return TradePlanOut(
        available=True,
        bias=bias,
        entry=entry,
        entry_ts=entry_ts,
        future_ts=future_ts,
        future_candles=horizon,
        boundary=entry,
        body_lower=body_lower,
        body_upper=body_upper,
        risk_lower=risk_lower,
        risk_upper=risk_upper,
        stop=stop,
        target=target,
        reward_risk=reward_risk,
        atr=atr_value,
        labels=labels,
        notes=notes,
        explanation=explanation,
    )


def _build_trade_plan_from_read(
    read: VisionRead,
    completed: Sequence[Candle],
    atr: Optional[float],
    step_minutes: int,
    future_candles: int,
    chart_close: Optional[float],
    max_drift: float = 0.05,
) -> Optional[TradePlanOut]:
    """Build the R/R overlay from the prices the vision model read off the screenshot.

    Only used when the read supplies a usable entry, stop and target AND the read price is
    consistent with the charted instrument (within ``max_drift``), so the rectangles stay on
    the same price scale as the real candles.
    """
    if not completed or read.stop is None or read.target is None:
        return None

    entry = read.entry or read.current_price or (chart_close if chart_close is not None else None)
    if entry is None:
        return None
    stop, target = read.stop, read.target

    # Bias: trust the model's direction when it agrees with the level geometry, else derive.
    if target > entry and stop < entry:
        bias = "BULLISH"
    elif target < entry and stop > entry:
        bias = "BEARISH"
    else:
        return None

    if read.current_price is not None and chart_close is not None and chart_close > 0:
        if abs(read.current_price - chart_close) / chart_close > max_drift:
            return None

    horizon = int(future_candles) if future_candles and future_candles > 0 else 20
    entry_ts = completed[-1].ts
    future_ts = entry_ts + timedelta(minutes=step_minutes * horizon)
    atr_value = atr if (atr and atr > 0) else abs(entry - stop)

    if bias == "BULLISH":
        body_lower, body_upper = entry, target
        risk_lower, risk_upper = stop, entry
    else:
        body_lower, body_upper = target, entry
        risk_lower, risk_upper = entry, stop

    reward_risk = (
        round(abs(target - entry) / abs(entry - stop), 2) if abs(entry - stop) > 0 else None
    )
    notes: List[str] = [
        "This overlay is derived from the prices the vision model read directly from your "
        "uploaded screenshot (entry, stop and target), positioned in real price/time coordinates.",
        "Image-read prices are estimates; verify them against your platform before acting on anything.",
    ]
    explanation = (
        f"Screenshot-based plan: the vision model read the entry/reference near {entry:.5f}, with "
        f"invalidation near {stop:.5f} and a target near {target:.5f} "
        f"({'uptrend' if bias == 'BULLISH' else 'downtrend'} read). The grey box projects the "
        f"target range and the red box marks the risk/invalidation area."
    )
    return TradePlanOut(
        available=True,
        bias=bias,
        entry=entry,
        entry_ts=entry_ts,
        future_ts=future_ts,
        future_candles=horizon,
        boundary=entry,
        body_lower=body_lower,
        body_upper=body_upper,
        risk_lower=risk_lower,
        risk_upper=risk_upper,
        stop=stop,
        target=target,
        reward_risk=reward_risk,
        atr=atr_value,
        source="screenshot",
        source_note="Entry, stop and target were read from the uploaded screenshot by the vision model.",
        labels={
            "body": "Target (from screenshot)",
            "risk": "Risk / invalidation (from screenshot)",
            "boundary": "Entry / reference (from screenshot)",
        },
        notes=notes,
        explanation=explanation,
    )


# --------------------------------------------------------------------------- #
# Narrative helpers
# --------------------------------------------------------------------------- #
def _direction_for(trend: str, screenshot: Optional[ScreenshotObservationOut]) -> str:
    if trend == "UP":
        return "BULLISH"
    if trend == "DOWN":
        return "BEARISH"
    if screenshot is not None and screenshot.direction in ("BULLISH", "BEARISH"):
        return screenshot.direction
    return "NEUTRAL"


def _summary(
    structure_summary: str,
    indicators: Sequence[IndicatorInfoOut],
    levels: Sequence[ChartLevelOut],
    candles_analyzed: int,
    sample: bool,
) -> str:
    parts: List[str] = [structure_summary]
    by_key = {i.key: i for i in indicators}
    rsi = by_key.get("rsi14")
    adx = by_key.get("adx14")
    if rsi and rsi.value is not None:
        parts.append(f"RSI(14) is {rsi.value:.1f} ({rsi.zone or 'neutral'} zone).")
    if adx and adx.value is not None:
        parts.append(f"ADX(14) is {adx.value:.1f}, showing {adx.zone or 'the current trend strength'}.")
    if levels:
        res = [l.price for l in levels if l.kind == "resistance"]
        sup = [l.price for l in levels if l.kind == "support"]
        if res:
            parts.append(f"Nearest resistance cluster is around {min(res):.5f}.")
        if sup:
            parts.append(f"Nearest support cluster is around {max(sup):.5f}.")
    else:
        parts.append("No reliably measurable support/resistance clusters were detected in this window.")
    parts.append(f"Analysis used {candles_analyzed} completed candles.")
    if sample:
        parts.append("Data is clearly-labelled sample data (demo mode), not live market data.")
    return " ".join(parts)


def _limitations(
    vr: ValidationResult,
    sample: bool,
    has_screenshot: bool,
    future_marker: Optional[FutureMarkerOut],
) -> List[str]:
    out: List[str] = [
        "Indicators and levels are computed from completed historical candles only and can be "
        "invalidated by new price action.",
        "Support/resistance are approximate swing-derivable areas, not exact prices.",
        "ChartMind does not forecast price or guarantee any outcome; treat all output as "
        "analytical observations.",
    ]
    if sample:
        out.append(
            "The market data shown is clearly-labelled SAMPLE data (demo mode) and is not live."
        )
    codes = {w.code for w in vr.warnings}
    if "missing_candles" in codes:
        out.append("There are gaps in the candle history; indicators use the available candles.")
    if "stale_data" in codes:
        out.append("The latest candle is older than the freshness threshold; readings may lag.")
    if vr.invalid_removed or vr.duplicates_removed:
        out.append("Some rows were dropped or collapsed during validation; see data warnings.")
    if has_screenshot:
        out.append(
            "Observations read from the screenshot are visual estimates, kept separate from the "
            "measured OHLC data, and may be less precise."
        )
    if future_marker is not None:
        out.append(
            "The future marker only marks a requested timestamp on the time axis; no price is "
            "predicted for it."
        )
    return out


def _candle_out(c: Candle, now: datetime, step_minutes: int) -> CandleOut:
    complete = c.ts + timedelta(minutes=step_minutes) <= now
    return CandleOut(ts=c.ts, open=c.open, high=c.high, low=c.low, close=c.close, complete=complete)


# --------------------------------------------------------------------------- #
# Screenshot observations
# --------------------------------------------------------------------------- #
def _observation_from_read(read: VisionRead, screenshot: ScreenshotInput) -> ScreenshotObservationOut:
    levels = [
        ScreenshotLevelOut(kind=l.get("kind", "support"), price=float(l["price"]), note=l.get("note", ""))
        for l in read.levels
        if l.get("price") is not None
    ]
    label = {
        "BULLISH": "Upward bias",
        "BEARISH": "Downward bias",
        "NEUTRAL": "Sideways",
    }.get(read.direction, "Sideways")
    tone = {"BULLISH": "bull", "BEARISH": "bear", "NEUTRAL": "neutral"}.get(read.direction, "neutral")
    return ScreenshotObservationOut(
        direction=read.direction,
        label=label,
        tone=tone,
        source=read.source,
        is_real=True,
        model_name=read.model_name,
        explanation=read.summary or "Vision model read of the uploaded chart.",
        evidence=list(read.evidence),
        visible_levels_note=(
            "Prices below were read directly from the uploaded image by the vision model and are "
            "visual estimates; the measured OHLC levels (if any) remain the reference unless the "
            "overlay explicitly says otherwise."
        ),
        instrument_hint=screenshot.instrument_hint,
        timeframe_hint=screenshot.timeframe_hint,
        warnings=[read.model_name + " read the uploaded image; treat image-read prices as approximate."],
        instrument=read.instrument,
        timeframe=read.timeframe,
        trend=read.trend,
        structure=read.structure,
        current_price=read.current_price,
        price_axis_low=read.price_axis_low,
        price_axis_high=read.price_axis_high,
        entry=read.entry,
        stop=read.stop,
        target=read.target,
        levels=levels,
        patterns=list(read.patterns),
        reasoning_steps=list(read.reasoning_steps),
        challenges=list(read.challenges),
    )


def _screenshot_observation(
    screenshot: ScreenshotInput,
) -> Tuple[Optional[ScreenshotObservationOut], Optional[VisionRead], List[str]]:
    """Read the screenshot. Returns (observation, rich_read, warnings)."""
    read, warnings = read_chart(screenshot.data, screenshot.content_type)
    if read is not None:
        return _observation_from_read(read, screenshot), read, warnings

    # No real vision model: fall back to the clearly-labelled heuristic preview.
    analysis, fallback_warnings = analyze_chart(screenshot.data, screenshot.content_type)
    warnings = list(warnings) + list(fallback_warnings)
    warnings.append(
        "Screenshot observations are separate from, and less precise than, the measured OHLC analysis."
    )
    observation = ScreenshotObservationOut(
        direction=analysis.direction,
        label=analysis.label,
        tone=analysis.tone,
        source=analysis.source,
        is_real=analysis.is_real,
        model_name=analysis.model_name,
        explanation=analysis.explanation,
        evidence=list(analysis.evidence),
        visible_levels_note=(
            "This preview reads the colour balance of the image only. It can describe the overall "
            "green/red tone but cannot determine exact candlestick prices, so no price levels are "
            "claimed from the screenshot."
        ),
        instrument_hint=screenshot.instrument_hint,
        timeframe_hint=screenshot.timeframe_hint,
        warnings=warnings,
    )
    return observation, None, warnings


# --------------------------------------------------------------------------- #
# Main entry point
# --------------------------------------------------------------------------- #
def analyze(
    symbol: str,
    interval: str,
    candles: int = DEFAULT_CANDLES,
    future_candles: int = 0,
    screenshot: Optional[ScreenshotInput] = None,
) -> ChartMindResultOut:
    interval = normalize_interval(interval)
    requested = max(MIN_CANDLES, min(int(candles or DEFAULT_CANDLES), MAX_CANDLES))
    now = datetime.now(timezone.utc)

    raw = fetch_candles(symbol, interval, requested)
    vr = validate_candles(raw, interval)

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

    indicators: List[IndicatorInfoOut] = [
        _info("ema20", ema20, 5),
        _info("ema50", ema50, 5),
        _info("rsi14", rsi14, 1, _zone_rsi(rsi14)),
        _info("adx14", adx14, 1, _zone_adx(adx14)),
        _info("atr14", atr14, 5),
    ]
    if adx14 is not None and pdi is not None and mdi is not None:
        direction = "upward pressure" if pdi >= mdi else "downward pressure"
        indicators[3].zone = f"{indicators[3].zone} · {direction}" if indicators[3].zone else direction

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

    structure = _build_structure(swings, closes, [c.ts for c in completed])

    tolerance = atr14 if (atr14 and atr14 > 0) else (max(highs) - min(lows)) * 0.02 if completed else 1e-5
    current_close = closes[-1] if closes else None
    enough = len(completed) >= MIN_CANDLES
    if enough:
        levels, zone_list = _build_levels(current_close, swings, tolerance)
    else:
        levels, zone_list = [], []

    swing_out = [
        SwingPointOut(kind=k, index=i, ts=completed[i].ts, price=p)
        for (k, i, p) in swings[-MAX_SWING_MARKERS:]
        if 0 <= i < len(completed)
    ]

    demand_zone = _build_demand_zone(levels) if enough else None

    screenshot_obs: Optional[ScreenshotObservationOut] = None
    vision_read: Optional[VisionRead] = None
    screenshot_warnings: List[str] = []
    if screenshot is not None:
        screenshot_obs, vision_read, screenshot_warnings = _screenshot_observation(screenshot)

    trade_plan = _build_trade_plan(
        trend=structure.trend,
        levels=levels,
        completed=completed,
        closes=closes,
        atr=atr14,
        step_minutes=interval_minutes(interval),
        future_candles=future_candles,
        sample=sample,
    ) if completed else None

    if vision_read is not None and completed:
        shot_plan = _build_trade_plan_from_read(
            read=vision_read,
            completed=completed,
            atr=atr14,
            step_minutes=interval_minutes(interval),
            future_candles=future_candles,
            chart_close=closes[-1] if closes else None,
        )
        if shot_plan is not None:
            trade_plan = shot_plan
            if screenshot_obs is not None:
                screenshot_obs.used_for_plan = True
        else:
            screenshot_warnings.append(
                "The vision model's read did not include a consistent entry/stop/target, so the "
                "overlay was drawn from the measured OHLC data instead."
            )

    if screenshot_obs is not None and screenshot_warnings:
        screenshot_obs.warnings = list(screenshot_obs.warnings) + screenshot_warnings

    future_marker: Optional[FutureMarkerOut] = None
    if future_candles and future_candles > 0 and completed:
        step = interval_minutes(interval)
        marker_ts = completed[-1].ts + timedelta(minutes=step * int(future_candles))
        future_marker = FutureMarkerOut(
            ts=marker_ts,
            candles_ahead=int(future_candles),
            note=(
                f"Marker for a requested future timestamp {int(future_candles)} candle(s) ahead. "
                "ChartMind marks the horizon only and does not predict a price for it."
            ),
        )

    summary = _summary(structure.summary, indicators, levels, len(completed), sample)

    pipeline: List[PipelineStageOut] = [
        PipelineStageOut(
            key="connect",
            label="Connecting to the configured market data provider",
            detail=(
                f"Demo/sample mode — provider '{provider_name('')}' not configured."
                if sample
                else f"Connected to {provider_name(status.provider) if status.is_live else 'provider'}."
            ),
            ok=bool(vr.candles),
        ),
        PipelineStageOut(
            key="fetch",
            label="Fetching market candles",
            detail=f"Requested {requested} candles; received {len(vr.candles)}.",
            ok=bool(vr.candles),
        ),
        PipelineStageOut(
            key="validate",
            label="Validating candle history",
            detail=(
                f"{len(completed)} completed candle(s); "
                f"{vr.duplicates_removed} duplicate(s), {vr.invalid_removed} invalid, "
                f"{vr.missing_candles} gap(s)."
            ),
            ok=bool(completed),
        ),
        PipelineStageOut(
            key="structure",
            label="Analyzing price structure",
            detail=f"Structure classified as {structure.trend}.",
            ok=bool(completed),
        ),
        PipelineStageOut(
            key="levels",
            label="Identifying support, resistance and price zones",
            detail=f"Detected {len(levels)} level(s) and {len(zone_list)} zone(s).",
            ok=True,
        ),
        PipelineStageOut(
            key="prepare",
            label="Preparing the chart analysis",
            detail=f"Plotted {len(swing_out)} swing marker(s) and {len(series)} indicator point(s).",
            ok=True,
        ),
    ]
    if screenshot is not None and screenshot_obs is not None:
        if screenshot_obs.is_real:
            detail = (
                f"{screenshot_obs.model_name} read the image "
                f"({len(screenshot_obs.reasoning_steps)} reasoning step(s), "
                f"{len(screenshot_obs.levels)} level(s))."
            )
        else:
            detail = f"Observations from {screenshot_obs.model_name} (no real vision model configured)."
        pipeline.append(
            PipelineStageOut(
                key="screenshot",
                label="Reading the uploaded screenshot",
                detail=detail,
                ok=screenshot_obs.is_real,
            )
        )

    pipeline.append(
        PipelineStageOut(
            key="overlay",
            label="Drawing risk/reward and demand overlays",
            detail=(
                (
                    f"Risk/reward overlay from {trade_plan.source} "
                    f"({trade_plan.bias}) and {demand_zone.role if demand_zone else 'no'} zone "
                    f"drawn in real price/time coordinates."
                    if trade_plan is not None
                    else "Overlays unavailable for this window."
                )
            ),
            ok=trade_plan is not None,
        )
    )

    limitations = _limitations(vr, sample, screenshot is not None, future_marker)
    if trade_plan is not None:
        if trade_plan.source == "screenshot":
            limitations.append(
                "Entry, stop and target in the overlay were read from your screenshot by a vision "
                "model and are visual estimates — verify them against your platform. They are not a "
                "trade recommendation and carry no accuracy claim."
            )
        else:
            limitations.append(
                "The risk/reward rectangles are a hypothetical, volatility-scaled illustration "
                "anchored to the last completed close. They are not a trade recommendation and carry "
                "no accuracy claim."
            )

    return ChartMindResultOut(
        status=status,
        symbol=symbol,
        interval=interval,
        requested_candles=requested,
        candles_analyzed=len(completed),
        candles=[_candle_out(c, now, interval_minutes(interval)) for c in vr.candles],
        series=series,
        indicators=indicators,
        structure=structure,
        levels=levels,
        zones=zone_list,
        swings=swing_out,
        future_marker=future_marker,
        trade_plan=trade_plan,
        demand_zone=demand_zone,
        summary=summary,
        limitations=limitations,
        warnings=vr.warnings,
        disclaimer=MIND_DISCLAIMER,
        screenshot=screenshot_obs,
        pipeline=pipeline,
        generated_at=now,
    )


def direction_for_result(result: ChartMindResultOut) -> str:
    return _direction_for(result.structure.trend, result.screenshot)
