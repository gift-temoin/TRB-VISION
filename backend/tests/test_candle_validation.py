from datetime import datetime, timedelta, timezone

from app.services.candle_validation import validate_candles
from app.services.forex_data import Candle

BASE = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)


def mk(minutes: int, o=1.1, h=1.2, l=1.0, c=1.15, real=True, tz=timezone.utc) -> Candle:
    return Candle(
        ts=BASE + timedelta(minutes=minutes) if tz else datetime(2026, 1, 1) + timedelta(minutes=minutes),
        open=o,
        high=h,
        low=l,
        close=c,
        source="Twelve Data",
        is_real=real,
    )


def _codes(result):
    return {w.code for w in result.warnings}


def test_empty_input_reports_no_data():
    result = validate_candles([], "H1", now=BASE + timedelta(days=10))
    assert result.candles == []
    assert "no_data" in _codes(result)


def test_unsorted_input_is_sorted_chronologically():
    raw = [mk(120), mk(0), mk(60)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    timestamps = [c.ts for c in result.candles]
    assert timestamps == sorted(timestamps)


def test_duplicate_timestamps_are_collapsed():
    raw = [mk(0, c=1.11, h=1.2), mk(60), mk(0, c=1.19, h=1.25)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert result.duplicates_removed == 1
    assert len(result.candles) == 2
    # last write wins
    assert result.candles[0].close == 1.19
    assert "duplicate_timestamps" in _codes(result)


def test_inconsistent_high_low_is_dropped():
    raw = [mk(0, o=1.1, h=1.0, l=1.2, c=1.15), mk(60)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert result.invalid_removed == 1
    assert len(result.candles) == 1
    assert "invalid_rows" in _codes(result)


def test_naive_timestamp_is_dropped():
    raw = [mk(0, tz=None), mk(60)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert result.invalid_removed == 1


def test_non_finite_values_are_dropped():
    raw = [Candle(BASE, 1.1, float("nan"), 1.0, 1.1, "x", True), mk(60)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert result.invalid_removed == 1


def test_missing_candles_are_detected():
    raw = [mk(0), mk(60), mk(240)]  # gap from 60 to 240 => 2 missing hourly candles
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert result.missing_candles == 2
    assert "missing_candles" in _codes(result)


def test_incomplete_last_candle_is_excluded():
    # last candle opens 10 minutes ago for an H1 interval -> still forming.
    now = BASE + timedelta(hours=2, minutes=10)
    raw = [mk(0), mk(60), mk(120)]
    result = validate_candles(raw, "H1", now=now)
    assert result.incomplete_removed == 1
    assert len(result.completed) == 2
    assert "incomplete_candle" in _codes(result)


def test_stale_data_is_flagged():
    raw = [mk(0), mk(60)]
    now = BASE + timedelta(hours=20)
    result = validate_candles(raw, "H1", now=now)
    assert "stale_data" in _codes(result)


def test_fresh_data_is_not_stale():
    raw = [mk(0), mk(60)]
    now = BASE + timedelta(hours=2, minutes=1)
    result = validate_candles(raw, "H1", now=now)
    assert "stale_data" not in _codes(result)
    assert len(result.completed) == 2


def test_sample_flag_is_preserved():
    raw = [mk(0, real=False), mk(60, real=False)]
    result = validate_candles(raw, "H1", now=BASE + timedelta(days=10))
    assert all(not c.is_real for c in result.completed)
