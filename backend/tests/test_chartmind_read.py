from datetime import datetime, timedelta, timezone

from app.services.chart_analysis import VisionRead, _parse_read, read_chart
from app.services.chartmind import _build_trade_plan_from_read
from app.services.forex_data import Candle, _resample, _yahoo_range, _yahoo_symbol
from app.services.forex_data import INTERVAL_SPECS


def _candles(count=30, base=1.1000):
    now = datetime(2026, 10, 16, 12, 0, tzinfo=timezone.utc)
    out = []
    for i in range(count):
        price = base + i * 0.0001
        out.append(
            Candle(
                ts=now + timedelta(hours=i),
                open=price,
                high=price + 0.0005,
                low=price - 0.0005,
                close=price + 0.0002,
                source="Yahoo Finance",
                is_real=True,
            )
        )
    return out


# --------------------------------------------------------------------------- #
# Yahoo provider helpers (no network)
# --------------------------------------------------------------------------- #
def test_yahoo_symbol_mapping():
    assert _yahoo_symbol("EUR/USD") == "EURUSD=X"
    assert _yahoo_symbol("XAU/USD") == "GC=F"
    assert _yahoo_symbol("BTC/USD") == "BTC-USD"
    # Unknown BASE/QUOTE falls back to the standard FX suffix.
    assert _yahoo_symbol("SEK/NOK") == "SEKNOK=X"


def test_yahoo_interval_coverage_maps():
    assert "60m"  # sanity
    # H4 has no native Yahoo interval; it is resampled from hourly.
    assert INTERVAL_SPECS["H4"].minutes == 240


def test_yahoo_range_scales_with_count():
    spec = INTERVAL_SPECS["H1"]
    assert _yahoo_range(spec, 100) == "1mo"
    assert _yahoo_range(spec, 2000) == "3mo"


def test_resample_h4_aggregates_ohlc():
    step = timedelta(hours=1)
    start = datetime(2026, 10, 16, 0, 0, tzinfo=timezone.utc)
    hourly = [
        Candle(
            ts=start + step * i,
            open=1.0 + i * 0.001,
            high=1.0 + i * 0.001 + 0.002,
            low=1.0 + i * 0.001 - 0.002,
            close=1.0 + i * 0.001 + 0.001,
            source="Yahoo Finance",
            is_real=True,
        )
        for i in range(8)
    ]
    four_h = _resample(hourly, 4)
    assert len(four_h) == 2
    assert four_h[0].open == hourly[0].open
    assert four_h[0].close == hourly[3].close
    assert four_h[0].high == max(c.high for c in hourly[:4])
    assert four_h[0].low == min(c.low for c in hourly[:4])


# --------------------------------------------------------------------------- #
# Vision read parsing
# --------------------------------------------------------------------------- #
def test_parse_read_extracts_structured_fields():
    parsed = {
        "instrument": "EURUSD",
        "timeframe": "1H",
        "trend": "UP",
        "structure": "Higher highs and higher lows in a rising channel.",
        "current_price": 1.1240,
        "price_axis_low": 1.1100,
        "price_axis_high": 1.1300,
        "direction": "BULLISH",
        "confidence": 0.68,
        "entry": 1.1240,
        "stop": 1.1200,
        "target": 1.1320,
        "levels": [
            {"kind": "support", "price": 1.1200, "note": "prior swing low"},
            {"kind": "resistance", "price": "1.1300", "note": "range top"},
        ],
        "patterns": ["ascending channel"],
        "reasoning_steps": ["read axis", "found swing highs", "drew trendline"],
        "challenges": ["axis labels were small"],
        "summary": "Bullish continuation favoured.",
    }
    read = _parse_read(parsed)
    assert read.direction == "BULLISH"
    assert read.trend == "UP"
    assert read.instrument == "EURUSD"
    assert read.current_price == 1.1240
    assert read.entry == 1.1240 and read.stop == 1.1200 and read.target == 1.1320
    assert len(read.levels) == 2
    assert read.reasoning_steps[0] == "read axis"
    assert read.challenges == ["axis labels were small"]
    assert read.evidence  # derived from reasoning steps


def test_parse_read_handles_garbage_gracefully():
    read = _parse_read({"direction": "sideways", "levels": "not-a-list", "reasoning_steps": None})
    assert read.direction == "NEUTRAL"
    assert read.levels == []
    assert read.reasoning_steps == []


def test_read_chart_without_vision_provider_returns_warning():
    # conftest pins vision_provider to "none".
    read, warnings = read_chart(b"not-an-image", "image/png")
    assert read is None
    assert warnings and "vision" in warnings[0].lower()


# --------------------------------------------------------------------------- #
# Screenshot-derived risk/reward overlay
# --------------------------------------------------------------------------- #
def test_build_trade_plan_from_read_bullish():
    candles = _candles(base=1.1240)
    read = VisionRead(
        direction="BULLISH",
        current_price=1.1240,
        entry=1.1240,
        stop=1.1200,
        target=1.1320,
    )
    plan = _build_trade_plan_from_read(
        read=read,
        completed=candles,
        atr=0.0010,
        step_minutes=60,
        future_candles=20,
        chart_close=1.1240,
    )
    assert plan is not None
    assert plan.source == "screenshot"
    assert plan.bias == "BULLISH"
    assert plan.boundary == 1.1240
    assert plan.body_upper == 1.1320 and plan.body_lower == 1.1240
    assert plan.risk_lower == 1.1200 and plan.risk_upper == 1.1240
    assert plan.reward_risk == 2.0
    assert "screenshot" in plan.source_note.lower()


def test_build_trade_plan_from_read_bearish():
    candles = _candles(base=1.1240)
    read = VisionRead(direction="BEARISH", current_price=1.1240, entry=1.1240, stop=1.1280, target=1.1120)
    plan = _build_trade_plan_from_read(
        read=read, completed=candles, atr=0.0010, step_minutes=60, future_candles=10, chart_close=1.1240
    )
    assert plan is not None
    assert plan.bias == "BEARISH"
    assert plan.body_lower == 1.1120 and plan.body_upper == 1.1240
    assert plan.risk_lower == 1.1240 and plan.risk_upper == 1.1280


def test_build_trade_plan_from_read_rejects_scale_mismatch():
    candles = _candles(base=1.1240)
    read = VisionRead(direction="BULLISH", current_price=1.5000, entry=1.5000, stop=1.4900, target=1.5200)
    plan = _build_trade_plan_from_read(
        read=read, completed=candles, atr=0.0010, step_minutes=60, future_candles=10, chart_close=1.1240
    )
    assert plan is None


def test_build_trade_plan_from_read_requires_stop_and_target():
    candles = _candles()
    read = VisionRead(direction="BULLISH", current_price=1.1240, entry=1.1240)
    assert (
        _build_trade_plan_from_read(
            read=read, completed=candles, atr=0.0010, step_minutes=60, future_candles=10, chart_close=1.1240
        )
        is None
    )
