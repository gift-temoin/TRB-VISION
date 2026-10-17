import math

import pytest

from app.services import indicators as ind


def test_ema_known_values():
    result = ind.ema([1, 2, 3, 4, 5], 3)
    assert result[0] is None and result[1] is None
    assert result[2] == pytest.approx(2.0)
    assert result[3] == pytest.approx(3.0)
    assert result[4] == pytest.approx(4.0)


def test_ema_warmup_all_none_when_too_short():
    assert ind.ema([1, 2], 5) == [None, None]


def test_rsi_all_gains_is_100():
    values = list(range(1, 20))  # strictly increasing
    result = ind.rsi(values, 14)
    assert result[14] == pytest.approx(100.0)
    assert result[-1] == pytest.approx(100.0)


def test_rsi_all_losses_is_zero():
    values = list(range(20, 1, -1))  # strictly decreasing
    result = ind.rsi(values, 14)
    assert result[14] == pytest.approx(0.0)


def test_rsi_warmup():
    assert all(v is None for v in ind.rsi([1, 2, 3], 14))


def test_atr_known_values():
    highs = [2, 2, 2]
    lows = [1, 1, 1]
    closes = [1.5, 1.5, 1.5]
    result = ind.atr(highs, lows, closes, 2)
    assert result[0] is None
    assert result[1] == pytest.approx(1.0)
    assert result[2] == pytest.approx(1.0)


def test_atr_uses_previous_close_gap():
    # Big gap between candles should make TR larger than high-low.
    highs = [1.0, 3.0]
    lows = [0.8, 2.8]
    closes = [0.9, 2.9]
    tr = ind.true_range(highs, lows, closes)
    assert tr[1] == pytest.approx(2.1)  # max(0.2, |3-0.9|=2.1, |2.8-0.9|=1.9)


def test_adx_uptrend_has_positive_di_and_values():
    closes = [1 + i * 0.01 for i in range(80)]
    highs = [c + 0.002 for c in closes]
    lows = [c - 0.002 for c in closes]
    adx, plus_di, minus_di = ind.adx(highs, lows, closes, 14)
    assert adx[-1] is not None
    assert plus_di[-1] is not None and minus_di[-1] is not None
    assert plus_di[-1] > minus_di[-1]


def test_adx_insufficient_length():
    adx, pdi, mdi = ind.adx([1, 2, 3], [0.5, 1.5, 2.5], [0.8, 1.8, 2.8], 14)
    assert all(v is None for v in adx)


def test_swing_points_detect_peak_and_trough():
    highs = [1, 2, 5, 2, 1, 2, 1]
    lows = [0, 1, 4, 1, 0, 1, 0]
    swings = ind.swing_points(highs, lows, left=1, right=1)
    kinds = [(k, i) for k, i, _ in swings]
    assert ("HIGH", 2) in kinds
    assert ("LOW", 4) in kinds


def test_swing_points_require_confirmation_after():
    # Peak at the very last index cannot be confirmed (no candles to the right).
    highs = [1, 2, 3, 4, 5]
    lows = [0, 1, 2, 3, 4]
    swings = ind.swing_points(highs, lows, left=1, right=2)
    assert all(i <= 2 for _, i, _ in swings)


def test_structure_summary_higher_highs_lows():
    swings = [("HIGH", 1, 10), ("LOW", 2, 5), ("HIGH", 3, 12), ("LOW", 4, 7)]
    summary = ind.structure_summary(swings)
    assert "upward" in summary.lower()


def test_latest_defined_skips_none_and_nan():
    assert ind.latest_defined([None, 1.0, None]) == 1.0
    assert ind.latest_defined([None, math.nan, None]) is None


def test_indicators_do_not_look_ahead():
    # The value at index i must be identical whether or not future candles exist.
    closes = [1 + (i % 7) * 0.01 for i in range(60)]
    full = ind.ema(closes, 20)
    partial = ind.ema(closes[:40], 20)
    assert full[39] == pytest.approx(partial[39])
