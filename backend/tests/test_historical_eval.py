from datetime import datetime, timedelta, timezone

from app.services.forex_data import Candle
from app.services.historical_eval import evaluate

BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def series(closes, step_minutes=60, real=True):
    out = []
    for i, c in enumerate(closes):
        out.append(
            Candle(
                ts=BASE + timedelta(minutes=step_minutes * i),
                open=c,
                high=c + 0.002,
                low=c - 0.002,
                close=c,
                source="Twelve Data" if real else "Sample data (demo - not live)",
                is_real=real,
            )
        )
    return out


def test_insufficient_data_is_reported_not_invented():
    result = evaluate(series([1.0 + i * 0.001 for i in range(40)]), "EUR/USD", "H1")
    assert result.available is False
    assert result.reason
    assert result.out_of_sample_accuracy is None


def test_chronological_split_has_no_overlap():
    candles = series([1.0 + i * 0.001 for i in range(120)])
    result = evaluate(candles, "EUR/USD", "H1", train_ratio=0.7)
    assert result.available is True
    assert result.train_end < result.test_start
    assert result.train_samples == int(120 * 0.7)
    assert result.test_start == candles[result.train_samples].ts


def test_uptrend_strategy_matches_direction():
    candles = series([1.0 + i * 0.002 for i in range(120)])
    result = evaluate(candles, "EUR/USD", "H1", train_ratio=0.7)
    assert result.out_of_sample_accuracy == 1.0
    always_up = next(b for b in result.baselines if b.name == "Always up")
    assert always_up.accuracy == 1.0
    # Strategy cannot beat a baseline that is also perfect on this series.
    assert result.edge_vs_best_baseline == 0.0


def test_baselines_are_present_and_comparable():
    candles = series([1.0 + (i % 9) * 0.001 for i in range(150)])
    result = evaluate(candles, "EUR/USD", "H1")
    names = {b.name for b in result.baselines}
    assert {"Always up", "Always down", "Momentum", "Random (seeded)"} <= names
    assert any(b.name.startswith("Majority") for b in result.baselines)
    # Every baseline evaluated on the same test set size.
    sizes = {b.samples for b in result.baselines if b.samples}
    assert len(sizes) == 1


def test_evaluation_is_reproducible():
    candles = series([1.0 + (i % 11) * 0.0007 for i in range(160)])
    a = evaluate(candles, "EUR/USD", "H1")
    b = evaluate(candles, "EUR/USD", "H1")
    assert a.out_of_sample_accuracy == b.out_of_sample_accuracy
    rand_a = next(x for x in a.baselines if x.name == "Random (seeded)").accuracy
    rand_b = next(x for x in b.baselines if x.name == "Random (seeded)").accuracy
    assert rand_a == rand_b


def test_sample_data_adds_uncertainty_note():
    candles = series([1.0 + i * 0.001 for i in range(120)], real=False)
    result = evaluate(candles, "EUR/USD", "H1")
    assert any("SAMPLE" in note for note in result.uncertainty)


def test_no_leakage_assumption_is_documented():
    candles = series([1.0 + i * 0.001 for i in range(120)])
    result = evaluate(candles, "EUR/USD", "H1")
    assert any("no future data" in a.lower() for a in result.assumptions)
    assert result.disclaimer
