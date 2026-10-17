"""Rule-based directional prediction engine.

This is intentionally a transparent, explainable baseline (EMA momentum). It does
NOT output a probability unless a calibrated, validated model is configured —
probability fields stay null so the UI never shows fabricated confidence. When
genuine data is unavailable the engine returns UNAVAILABLE rather than inventing
a direction.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional, Tuple

from ..schemas import PredictionOut, SeriesPoint
from .market_data import Instrument, MarketDataService, SAMPLE_SOURCE, market_data

MODEL_NAME = "TRB Momentum-EMA (rule-based)"
MODEL_STATUS = "UNCALIBRATED"

# Prediction combinations produced per instrument.
COMBOS: List[Tuple[str, str]] = [("H1", "1h"), ("D1", "1d")]


class _Metrics:
    def __init__(self) -> None:
        self.last_success: Optional[datetime] = None
        self.recent_errors: int = 0
        self.count: int = 0

    def success(self) -> None:
        self.last_success = datetime.now(timezone.utc)

    def error(self) -> None:
        self.recent_errors += 1


metrics = _Metrics()


def _ema(values: List[float], period: int) -> float:
    if not values:
        return 0.0
    k = 2 / (period + 1)
    ema = values[0]
    for v in values[1:]:
        ema = v * k + ema * (1 - k)
    return ema


def _classify(series: List[SeriesPoint]) -> Tuple[str, List[str], str]:
    prices = [p.c for p in series]
    short = _ema(prices, 12)
    long = _ema(prices, 26)
    last = prices[-1]
    spread = (short - long) / long if long else 0.0
    recent = prices[-12:]
    momentum = (recent[-1] - recent[0]) / recent[0] if recent and recent[0] else 0.0

    threshold = 0.0006
    if spread > threshold and momentum > 0:
        direction = "BULLISH"
    elif spread < -threshold and momentum < 0:
        direction = "BEARISH"
    elif abs(spread) <= threshold and abs(momentum) <= threshold:
        direction = "NEUTRAL"
    elif spread >= 0:
        direction = "BULLISH"
    else:
        direction = "BEARISH"

    evidence = [
        f"Fast EMA ({short:.5f}) vs slow EMA ({long:.5f})",
        f"Short-term momentum {momentum * 100:+.2f}% over the last 12 candles",
        f"Latest reading {last:.5f}",
    ]
    explanation = {
        "BULLISH": "Short-term trend is above the slower baseline with positive momentum, "
        "suggesting upward directional bias over the horizon.",
        "BEARISH": "Short-term trend has crossed below the slower baseline with negative "
        "momentum, suggesting downward directional bias over the horizon.",
        "NEUTRAL": "Price action is balanced around the baseline with weak momentum, "
        "suggesting a sideways bias over the horizon.",
    }[direction]
    return direction, evidence, explanation


class PredictionService:
    def __init__(self, md: MarketDataService) -> None:
        self.md = md

    def _placeholder(self, inst: Instrument, timeframe: str, horizon: str) -> PredictionOut:
        return PredictionOut(
            symbol=inst.symbol,
            name=inst.name,
            category=inst.category,
            timeframe=timeframe,
            horizon=horizon,
            direction="NEUTRAL",
            status="UNAVAILABLE",
            probability=None,
            probability_label=None,
            explanation=(
                "Prediction engine not configured. A real market data provider and a tested "
                "prediction model must be set up on the server before genuine signals can be "
                "issued."
            ),
            evidence=[],
            model_status="OFFLINE",
            model_name=MODEL_NAME,
            data_source="No live provider configured",
            data_as_of=None,
            generated_at=None,
            is_real=False,
        )

    def _sample(self, inst: Instrument, timeframe: str, horizon: str) -> PredictionOut:
        series = self.md.get_series(inst)
        assert series is not None
        direction, evidence, explanation = _classify(series)
        return PredictionOut(
            symbol=inst.symbol,
            name=inst.name,
            category=inst.category,
            timeframe=timeframe,
            horizon=horizon,
            direction=direction,
            status="CURRENT",
            probability=None,
            probability_label=None,
            explanation="Placeholder signal for interface preview. " + explanation,
            evidence=evidence,
            model_status=MODEL_STATUS,
            model_name=MODEL_NAME,
            data_source=SAMPLE_SOURCE,
            data_as_of=series[-1].t,
            generated_at=datetime.now(timezone.utc),
            is_real=False,
        )

    def predict_for(self, inst: Instrument, timeframe: str, horizon: str) -> PredictionOut:
        if not self.md.configured:
            if self.md.demo:
                return self._sample(inst, timeframe, horizon)
            return self._placeholder(inst, timeframe, horizon)

        series = self.md.get_series(inst)
        if not series or len(series) < 30:
            metrics.error()
            return PredictionOut(
                symbol=inst.symbol,
                name=inst.name,
                category=inst.category,
                timeframe=timeframe,
                horizon=horizon,
                direction="NEUTRAL",
                status="UNAVAILABLE",
                probability=None,
                probability_label=None,
                explanation="Market data is currently unavailable or invalid, so no prediction "
                "can be generated. Try again later.",
                evidence=[],
                model_status="DEGRADED",
                model_name=MODEL_NAME,
                data_source=self.md.provider_name,
                data_as_of=None,
                generated_at=None,
                is_real=False,
            )

        metrics.success()
        metrics.count += 1
        direction, evidence, explanation = _classify(series)
        return PredictionOut(
            symbol=inst.symbol,
            name=inst.name,
            category=inst.category,
            timeframe=timeframe,
            horizon=horizon,
            direction=direction,
            status="CURRENT",
            probability=None,  # only shown when a calibrated model is configured
            probability_label=None,
            explanation=explanation,
            evidence=evidence,
            model_status=MODEL_STATUS,
            model_name=MODEL_NAME,
            data_source=self.md.provider_name,
            data_as_of=series[-1].t,
            generated_at=datetime.now(timezone.utc),
            is_real=True,
        )

    def predict_all(self, instruments: List[Instrument]) -> List[PredictionOut]:
        out: List[PredictionOut] = []
        for inst in instruments:
            for timeframe, horizon in COMBOS:
                out.append(self.predict_for(inst, timeframe, horizon))
        return out


prediction_service = PredictionService(market_data)
