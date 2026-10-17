"""Candle validation: timestamps, duplicates, missing candles, completeness, staleness.

The goal is that downstream indicators only ever see clean, chronologically
ordered, *completed* candles, and that any data quality problem is reported to the
user instead of silently hidden.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Sequence

from ..config import settings
from ..schemas import CandleWarningOut
from .forex_data import Candle, interval_minutes


@dataclass
class ValidationResult:
    candles: List[Candle] = field(default_factory=list)
    completed: List[Candle] = field(default_factory=list)
    warnings: List[CandleWarningOut] = field(default_factory=list)
    duplicates_removed: int = 0
    invalid_removed: int = 0
    missing_candles: int = 0
    incomplete_removed: int = 0

    @property
    def latest_ts(self) -> Optional[datetime]:
        return self.candles[-1].ts if self.candles else None

    @property
    def latest_complete_ts(self) -> Optional[datetime]:
        return self.completed[-1].ts if self.completed else None


def _is_valid(c: Candle) -> bool:
    values = (c.open, c.high, c.low, c.close)
    if any(not isinstance(v, (int, float)) or math.isnan(v) or math.isinf(v) for v in values):
        return False
    if c.high < c.low:
        return False
    if c.high < max(c.open, c.close) - 1e-9:
        return False
    if c.low > min(c.open, c.close) + 1e-9:
        return False
    if c.ts.tzinfo is None:
        return False
    return True


def validate_candles(
    raw: Sequence[Candle],
    interval: str,
    now: Optional[datetime] = None,
) -> ValidationResult:
    result = ValidationResult()
    now = now or datetime.now(timezone.utc)
    step = timedelta(minutes=interval_minutes(interval))

    if not raw:
        result.warnings.append(
            CandleWarningOut(code="no_data", message="No candles were returned by the provider.")
        )
        return result

    # 1) Validity (timestamps, finite OHLC, consistent high/low).
    valid: List[Candle] = []
    for c in raw:
        if _is_valid(c):
            valid.append(c)
        else:
            result.invalid_removed += 1
    if result.invalid_removed:
        result.warnings.append(
            CandleWarningOut(
                code="invalid_rows",
                message=f"{result.invalid_removed} candle(s) had invalid values or timestamps and were dropped.",
                count=result.invalid_removed,
            )
        )
    if not valid:
        result.warnings.append(
            CandleWarningOut(code="no_valid_data", message="No valid candles remained after validation.")
        )
        return result

    # 2) Chronological ordering.
    valid.sort(key=lambda c: c.ts)

    # 3) De-duplicate identical timestamps (keep the last occurrence).
    deduped: List[Candle] = []
    seen: set[datetime] = set()
    for c in valid:
        if c.ts in seen:
            result.duplicates_removed += 1
            # replace the previous record for this timestamp
            for i in range(len(deduped) - 1, -1, -1):
                if deduped[i].ts == c.ts:
                    deduped[i] = c
                    break
        else:
            seen.add(c.ts)
            deduped.append(c)
    if result.duplicates_removed:
        result.warnings.append(
            CandleWarningOut(
                code="duplicate_timestamps",
                message=f"{result.duplicates_removed} duplicate timestamp(s) were found and collapsed.",
                count=result.duplicates_removed,
            )
        )

    # 4) Missing candles (gaps larger than one interval step).
    prev: Optional[Candle] = None
    for c in deduped:
        if prev is not None:
            delta = (c.ts - prev.ts).total_seconds()
            if delta > step.total_seconds() * 1.5:
                gap = int(round(delta / step.total_seconds())) - 1
                if gap > 0:
                    result.missing_candles += gap
        prev = c
    if result.missing_candles:
        result.warnings.append(
            CandleWarningOut(
                code="missing_candles",
                message=(
                    f"{result.missing_candles} candle(s) appear to be missing within the range "
                    "(gaps detected). Indicators use the available completed candles."
                ),
                count=result.missing_candles,
            )
        )

    result.candles = deduped

    # 5) Completeness: only candles whose window has fully closed are "completed".
    completed = [c for c in deduped if c.ts + step <= now]
    result.incomplete_removed = len(deduped) - len(completed)
    result.completed = completed
    if result.incomplete_removed:
        result.warnings.append(
            CandleWarningOut(
                code="incomplete_candle",
                message=(
                    f"{result.incomplete_removed} still-forming candle(s) were excluded from indicator "
                    "calculations (indicators use completed candles only)."
                ),
                count=result.incomplete_removed,
            )
        )

    # 6) Staleness.
    if completed:
        age = now - completed[-1].ts
        if age > timedelta(minutes=settings.forex_stale_minutes):
            hours = age.total_seconds() / 3600
            result.warnings.append(
                CandleWarningOut(
                    code="stale_data",
                    message=(
                        f"The latest completed candle is about {hours:.1f}h old, which exceeds the "
                        f"{settings.forex_stale_minutes}-minute freshness threshold. Treat readings with caution."
                    ),
                )
            )
    else:
        result.warnings.append(
            CandleWarningOut(
                code="no_completed_candles",
                message="No completed candles are available yet for indicator calculations.",
            )
        )

    return result
