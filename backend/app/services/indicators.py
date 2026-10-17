"""Technical indicators for historical trend analysis.

All functions operate on **completed** candles only (the caller passes a
chronologically ordered list). Indicator value at index ``i`` depends solely on
candles at indices ``<= i`` — there is no future-data leakage, which is what makes
the historical evaluation module valid.

The functions return lists aligned to the input length, using ``None`` for
positions where the indicator is not yet defined (warm-up period).

Nothing here predicts the future or guarantees outcomes; indicators describe what
has already happened.
"""
from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple


# --------------------------------------------------------------------------- #
# Moving averages
# --------------------------------------------------------------------------- #
def ema(values: Sequence[float], period: int) -> List[Optional[float]]:
    """Exponential Moving Average.

    Seeded with the simple average of the first ``period`` values, then advanced
    with multiplier ``k = 2 / (period + 1)``:
        EMA_t = value_t * k + EMA_{t-1} * (1 - k)
    """
    out: List[Optional[float]] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    k = 2 / (period + 1)
    seed = sum(values[:period]) / period
    out[period - 1] = seed
    prev = seed
    for i in range(period, len(values)):
        prev = values[i] * k + prev * (1 - k)
        out[i] = prev
    return out


def sma(values: Sequence[float], period: int) -> List[Optional[float]]:
    out: List[Optional[float]] = [None] * len(values)
    if period <= 0 or len(values) < period:
        return out
    running = sum(values[:period])
    out[period - 1] = running / period
    for i in range(period, len(values)):
        running += values[i] - values[i - period]
        out[i] = running / period
    return out


# --------------------------------------------------------------------------- #
# RSI (Wilder)
# --------------------------------------------------------------------------- #
def rsi(values: Sequence[float], period: int = 14) -> List[Optional[float]]:
    """Relative Strength Index using Wilder's smoothing.

    RS = avg_gain / avg_loss; RSI = 100 - 100 / (1 + RS). RSI ranges 0-100;
    readings above 70 are conventionally "overbought" and below 30 "oversold".
    """
    n = len(values)
    out: List[Optional[float]] = [None] * n
    if period <= 0 or n < period + 1:
        return out
    gains = 0.0
    losses = 0.0
    for i in range(1, period + 1):
        change = values[i] - values[i - 1]
        if change >= 0:
            gains += change
        else:
            losses -= change
    avg_gain = gains / period
    avg_loss = losses / period
    out[period] = _rsi_value(avg_gain, avg_loss)
    for i in range(period + 1, n):
        change = values[i] - values[i - 1]
        gain = change if change > 0 else 0.0
        loss = -change if change < 0 else 0.0
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        out[i] = _rsi_value(avg_gain, avg_loss)
    return out


def _rsi_value(avg_gain: float, avg_loss: float) -> float:
    if avg_loss == 0:
        return 100.0 if avg_gain > 0 else 50.0
    rs = avg_gain / avg_loss
    return 100.0 - 100.0 / (1.0 + rs)


# --------------------------------------------------------------------------- #
# ATR (Wilder)
# --------------------------------------------------------------------------- #
def true_range(highs: Sequence[float], lows: Sequence[float], closes: Sequence[float]) -> List[float]:
    tr: List[float] = []
    for i in range(len(highs)):
        if i == 0:
            tr.append(highs[i] - lows[i])
        else:
            tr.append(
                max(
                    highs[i] - lows[i],
                    abs(highs[i] - closes[i - 1]),
                    abs(lows[i] - closes[i - 1]),
                )
            )
    return tr


def atr(
    highs: Sequence[float], lows: Sequence[float], closes: Sequence[float], period: int = 14
) -> List[Optional[float]]:
    """Average True Range (Wilder). Volatility in price units; higher = choppier."""
    n = len(highs)
    out: List[Optional[float]] = [None] * n
    if period <= 0 or n < period:
        return out
    tr = true_range(highs, lows, closes)
    prev = sum(tr[:period]) / period
    out[period - 1] = prev
    for i in range(period, n):
        prev = (prev * (period - 1) + tr[i]) / period
        out[i] = prev
    return out


# --------------------------------------------------------------------------- #
# ADX (Wilder) with +DI / -DI
# --------------------------------------------------------------------------- #
def adx(
    highs: Sequence[float],
    lows: Sequence[float],
    closes: Sequence[float],
    period: int = 14,
) -> Tuple[List[Optional[float]], List[Optional[float]], List[Optional[float]]]:
    """Average Directional Index with +DI and -DI (Wilder).

    ADX measures trend *strength* (0-100) regardless of direction; >25 generally
    indicates a trending market, <20 a range. +DI/-DI indicate which side is
    dominant (``+DI > -DI`` favours upward pressure).
    """
    n = len(highs)
    adx_out: List[Optional[float]] = [None] * n
    plus_di_out: List[Optional[float]] = [None] * n
    minus_di_out: List[Optional[float]] = [None] * n
    if period <= 0 or n < period * 2:
        return adx_out, plus_di_out, minus_di_out

    tr = true_range(highs, lows, closes)
    plus_dm = [0.0] * n
    minus_dm = [0.0] * n
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm[i] = up if (up > down and up > 0) else 0.0
        minus_dm[i] = down if (down > up and down > 0) else 0.0

    smoothed_tr = sum(tr[1 : period + 1])
    smoothed_plus = sum(plus_dm[1 : period + 1])
    smoothed_minus = sum(minus_dm[1 : period + 1])

    dx_values: List[Optional[float]] = [None] * n

    def _di(sm_tr: float, sm_dm: float) -> Optional[float]:
        if sm_tr == 0:
            return 0.0
        return 100.0 * sm_dm / sm_tr

    def _dx(p: Optional[float], m: Optional[float]) -> Optional[float]:
        if p is None or m is None:
            return None
        total = p + m
        if total == 0:
            return 0.0
        return 100.0 * abs(p - m) / total

    first = period
    pdi = _di(smoothed_tr, smoothed_plus)
    mdi = _di(smoothed_tr, smoothed_minus)
    plus_di_out[first] = pdi
    minus_di_out[first] = mdi
    dx_values[first] = _dx(pdi, mdi)

    for i in range(first + 1, n):
        smoothed_tr = smoothed_tr - smoothed_tr / period + tr[i]
        smoothed_plus = smoothed_plus - smoothed_plus / period + plus_dm[i]
        smoothed_minus = smoothed_minus - smoothed_minus / period + minus_dm[i]
        pdi = _di(smoothed_tr, smoothed_plus)
        mdi = _di(smoothed_tr, smoothed_minus)
        plus_di_out[i] = pdi
        minus_di_out[i] = mdi
        dx_values[i] = _dx(pdi, mdi)

    # ADX = Wilder average of DX, starting once `period` DX values exist.
    start = first + period - 1
    if start >= n:
        return adx_out, plus_di_out, minus_di_out
    window = [dx_values[j] for j in range(first, start + 1) if dx_values[j] is not None]
    if len(window) < period:
        return adx_out, plus_di_out, minus_di_out
    prev = sum(window) / len(window)
    adx_out[start] = prev
    for i in range(start + 1, n):
        dx = dx_values[i]
        if dx is None:
            continue
        prev = (prev * (period - 1) + dx) / period
        adx_out[i] = prev
    return adx_out, plus_di_out, minus_di_out


# --------------------------------------------------------------------------- #
# Swing structure
# --------------------------------------------------------------------------- #
def swing_points(
    highs: Sequence[float],
    lows: Sequence[float],
    left: int = 2,
    right: int = 2,
) -> List[Tuple[str, int, float]]:
    """Fractal swing highs/lows.

    A swing high at ``i`` requires ``highs[i]`` to be strictly the highest within
    ``left`` candles before and ``right`` candles after. Because it needs ``right``
    later candles to confirm, the most recent ``right`` candles can never be
    confirmed swings — this avoids repainting/future-looking structure.
    """
    n = len(highs)
    out: List[Tuple[str, int, float]] = []
    if n < left + right + 1:
        return out
    for i in range(left, n - right):
        window_h = highs[i - left : i + right + 1]
        if highs[i] == max(window_h) and window_h.count(highs[i]) == 1:
            out.append(("HIGH", i, highs[i]))
        window_l = lows[i - left : i + right + 1]
        if lows[i] == min(window_l) and window_l.count(lows[i]) == 1:
            out.append(("LOW", i, lows[i]))
    return out


def structure_summary(swings: Sequence[Tuple[str, int, float]]) -> str:
    """Classify structure from the last two highs and lows (higher-highs vs lower-lows)."""
    highs = [s for s in swings if s[0] == "HIGH"]
    lows = [s for s in swings if s[0] == "LOW"]
    if len(highs) < 2 or len(lows) < 2:
        return "Not enough confirmed swings to describe structure yet."
    hh = highs[-1][2] > highs[-2][2]
    hl = lows[-1][2] > lows[-2][2]
    if hh and hl:
        return "Higher highs and higher lows — an established upward structure."
    if not hh and not hl:
        return "Lower highs and lower lows — an established downward structure."
    if hh and not hl:
        return "Higher highs but lower lows — an expanding, indecisive range."
    return "Lower highs but higher lows — a contracting range (possible squeeze)."


# --------------------------------------------------------------------------- #
# Plain-language explanations (requirement 5)
# --------------------------------------------------------------------------- #
EXPLANATIONS: dict[str, dict[str, str]] = {
    "ema20": {
        "name": "EMA 20",
        "window": "20",
        "what": "An exponential moving average of the last 20 closing prices.",
        "how": "Each close is weighted, with the most recent closes given more weight "
        "(multiplier 2/(20+1)=0.0952). It reacts faster than a simple average.",
        "contributes": "Shows the short-term trend and acts as dynamic support/resistance; "
        "price above EMA20 suggests recent upward pressure.",
    },
    "ema50": {
        "name": "EMA 50",
        "window": "50",
        "what": "An exponential moving average of the last 50 closing prices.",
        "how": "Same weighting method as EMA20 but over a longer window, so it changes "
        "more slowly.",
        "contributes": "Represents the medium-term trend; the EMA20/EMA50 relationship "
        "helps distinguish a real trend from noise.",
    },
    "rsi14": {
        "name": "RSI 14",
        "window": "14",
        "what": "Relative Strength Index: a 0-100 momentum oscillator.",
        "how": "Compares average gains to average losses over 14 candles using Wilder's "
        "smoothing. RSI = 100 - 100/(1 + avg_gain/avg_loss).",
        "contributes": "Flags momentum extremes: above ~70 is conventionally overbought, "
        "below ~30 oversold. It can also show divergence versus price.",
    },
    "adx14": {
        "name": "ADX 14",
        "window": "14",
        "what": "Average Directional Index: trend strength from 0-100.",
        "how": "Computes +DI and -DI from directional movement, derives DX, then averages "
        "DX over 14 candles with Wilder's smoothing.",
        "contributes": "Measures how strong a trend is (not its direction): above ~25 is "
        "trending, below ~20 is ranging. +DI vs -DI shows which side dominates.",
    },
    "atr14": {
        "name": "ATR 14",
        "window": "14",
        "what": "Average True Range: typical candle size in price units.",
        "how": "Averages the true range (max of high-low, |high-prev close|, "
        "|low-prev close|) over 14 candles with Wilder's smoothing.",
        "contributes": "Quantifies volatility for sizing stops/targets; rising ATR means "
        "larger swings, falling ATR means calmer conditions.",
    },
    "swing": {
        "name": "Swing structure",
        "window": "2 / 2",
        "what": "Confirmed local peaks (swing highs) and troughs (swing lows).",
        "how": "A candle is a swing high if its high is the highest of 2 candles each side; "
        "a swing low if its low is the lowest of 2 each side. Only confirmed swings are used.",
        "contributes": "Describes market structure (higher highs/lows vs lower highs/lows) "
        "and gives nearby support/resistance levels.",
    },
}


def latest_defined(series: Sequence[Optional[float]]) -> Optional[float]:
    for value in reversed(series):
        if value is not None and not (isinstance(value, float) and math.isnan(value)):
            return value
    return None
