"""Historical, out-of-sample evaluation with strict chronological splits.

Design rules that prevent look-ahead bias:

* Candles are strictly chronological.
* The dataset is split into an earlier *train* period and a later *test* period.
  No test candle is ever used to fit anything.
* Indicator values at index ``i`` depend only on candles ``<= i`` (see
  ``indicators``), so a signal made at ``i`` only uses information available then.
* The prediction target is the next candle's direction (``close[i+1]`` vs
  ``close[i]``), so evaluating index ``i`` never peeks at ``i+1`` features.

Metrics are computed from the actual data. When there is too little data the
module reports ``available=False`` rather than inventing numbers. It reports
sample sizes, dates, baselines and uncertainty, and never claims guaranteed
predictions.
"""
from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Sequence, Tuple

from ..schemas import EvalBaselineOut, ForexEvaluationOut
from . import indicators as ind
from .forex_data import Candle

STRATEGY_NAME = "EMA20/EMA50 trend + RSI14 confirmation (educational baseline strategy)"
DISCLAIMER = (
    "Backtest of a simple, publicly-known indicator rule on historical data. Past "
    "performance is not indicative of future results, and no accuracy figure here is "
    "a guarantee. This is an educational measurement, not a trading recommendation."
)
MIN_CANDLES = 80
MIN_TEST_SAMPLES = 12


@dataclass
class _Signals:
    preds: List[Optional[str]]  # "UP" / "DOWN" / None aligned to closes
    actual: List[Optional[str]]


def _actual_direction(closes: Sequence[float]) -> List[Optional[str]]:
    out: List[Optional[str]] = [None] * len(closes)
    for i in range(len(closes) - 1):
        delta = closes[i + 1] - closes[i]
        out[i] = "UP" if delta > 0 else "DOWN" if delta < 0 else None
    return out


def _strategy_signals(closes: Sequence[float]) -> List[Optional[str]]:
    ema20 = ind.ema(closes, 20)
    ema50 = ind.ema(closes, 50)
    rsi = ind.rsi(closes, 14)
    preds: List[Optional[str]] = [None] * len(closes)
    for i in range(len(closes)):
        e20, e50, r = ema20[i], ema50[i], rsi[i]
        if e20 is None or e50 is None or r is None:
            continue
        if e20 > e50 and r > 50:
            preds[i] = "UP"
        elif e20 < e50 and r < 50:
            preds[i] = "DOWN"
    return preds


def _accuracy(preds: Sequence[Optional[str]], actual: Sequence[Optional[str]], idxs: Sequence[int]) -> Tuple[Optional[float], int]:
    correct = 0
    counted = 0
    for i in idxs:
        if preds[i] is None or actual[i] is None:
            continue
        counted += 1
        if preds[i] == actual[i]:
            correct += 1
    if counted == 0:
        return None, 0
    return correct / counted, counted


def _always(pred: str, actual: Sequence[Optional[str]], idxs: Sequence[int]) -> Tuple[Optional[float], int]:
    preds = [pred if actual[i] is not None else None for i in range(len(actual))]
    return _accuracy(preds, actual, idxs)


def _baseline_out(name: str, description: str, acc: Optional[float], n: int) -> EvalBaselineOut:
    return EvalBaselineOut(name=name, description=description, accuracy=acc, samples=n)


def evaluate(
    candles: Sequence[Candle],
    symbol: str,
    interval: str,
    train_ratio: float = 0.7,
) -> ForexEvaluationOut:
    assumptions = [
        "Candles are chronological and the split is strictly time-ordered (train earlier, test later).",
        "Indicators at each candle use only that candle and earlier data (no future data).",
        "The target is the direction of the very next candle's close versus the current close.",
        "A 'neutral' next candle (exactly equal close) is treated as no outcome and excluded.",
        "Baselines are evaluated on the identical test indices for a fair comparison.",
    ]
    uncertainty = [
        "Accuracy is measured on one historical sample; a different period could give a different result.",
        "Only backtests — no transaction costs, spread or slippage are modelled.",
        "A single indicator rule can fit noise; treat any edge as fragile until validated on more data.",
    ]

    n = len(candles)
    if n < MIN_CANDLES:
        return ForexEvaluationOut(
            symbol=symbol,
            interval=interval,
            available=False,
            reason=f"Not enough historical candles to evaluate (need at least {MIN_CANDLES}, got {n}).",
            strategy_name=STRATEGY_NAME,
            assumptions=assumptions,
            uncertainty=uncertainty,
            disclaimer=DISCLAIMER,
        )

    train_ratio = min(max(train_ratio, 0.3), 0.9)
    split = int(n * train_ratio)
    closes = [c.close for c in candles]
    actual = _actual_direction(closes)
    preds = _strategy_signals(closes)

    # Evaluation points: test period, excluding the final candle (no next candle to score).
    eval_idxs = list(range(split, n - 1))
    if len(eval_idxs) < MIN_TEST_SAMPLES:
        return ForexEvaluationOut(
            symbol=symbol,
            interval=interval,
            available=False,
            reason="The test period is too short to report a reliable out-of-sample result.",
            strategy_name=STRATEGY_NAME,
            assumptions=assumptions,
            uncertainty=uncertainty,
            disclaimer=DISCLAIMER,
        )

    strat_acc, strat_n = _accuracy(preds, actual, eval_idxs)
    coverage = (strat_n / len(eval_idxs)) if eval_idxs else None

    # Baselines.
    up_acc, up_n = _always("UP", actual, eval_idxs)
    down_acc, down_n = _always("DOWN", actual, eval_idxs)
    # Momentum: predict the same direction as the current candle (previous move persists).
    prev_move: List[Optional[str]] = [None] * n
    for i in range(1, n):
        d = closes[i] - closes[i - 1]
        prev_move[i] = "UP" if d > 0 else "DOWN" if d < 0 else None
    mom_acc, mom_n = _accuracy(prev_move, actual, eval_idxs)

    # Majority class learned from the TRAIN period only (no leakage).
    train_up = sum(1 for i in range(0, split) if actual[i] == "UP")
    train_down = sum(1 for i in range(0, split) if actual[i] == "DOWN")
    majority = "UP" if train_up >= train_down else "DOWN"
    maj_acc, maj_n = _always(majority, actual, eval_idxs)

    rng = random.Random(42)
    random_preds: List[Optional[str]] = [rng.choice(["UP", "DOWN"]) for _ in range(n)]
    rand_acc, rand_n = _accuracy(random_preds, actual, eval_idxs)

    baselines = [
        _baseline_out("Always up", "Predict up for every candle.", up_acc, up_n),
        _baseline_out("Always down", "Predict down for every candle.", down_acc, down_n),
        _baseline_out("Momentum", "Predict that the current move continues.", mom_acc, mom_n),
        _baseline_out(f"Majority ({majority})", "Predict the most common class seen in the train period.", maj_acc, maj_n),
        _baseline_out("Random (seeded)", "Coin flip, fixed seed for reproducibility.", rand_acc, rand_n),
    ]

    baseline_accs = [b.accuracy for b in baselines if b.accuracy is not None]
    best_baseline = max(baseline_accs) if baseline_accs else None
    edge = None
    if strat_acc is not None and best_baseline is not None:
        edge = strat_acc - best_baseline

    test_start = candles[split].ts if split < n else None
    test_end = candles[n - 1].ts if n else None

    if not candles[-1].is_real:
        uncertainty.append(
            "This run used clearly-labelled SAMPLE data (demo mode); the metrics above are "
            "illustrative of the method and are NOT a real-market result."
        )

    return ForexEvaluationOut(
        symbol=symbol,
        interval=interval,
        available=True,
        strategy_name=STRATEGY_NAME,
        train_samples=split,
        test_samples=len(eval_idxs),
        train_start=candles[0].ts,
        train_end=candles[split - 1].ts if split > 0 else None,
        test_start=test_start,
        test_end=test_end,
        out_of_sample_accuracy=strat_acc,
        coverage=coverage,
        baselines=baselines,
        edge_vs_best_baseline=edge,
        assumptions=assumptions,
        uncertainty=uncertainty,
        disclaimer=DISCLAIMER,
    )
