from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .countries import Country, flag_for

# A user is considered "online" if they made an authenticated request recently.
ONLINE_WINDOW = timedelta(minutes=5)


def _is_online(last_seen: Optional[datetime]) -> bool:
    if last_seen is None:
        return False
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - last_seen <= ONLINE_WINDOW


# ---------- Users / auth ----------
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    country: str
    country_name: Optional[str] = None
    country_flag: Optional[str] = None
    phone: Optional[str] = None
    is_admin: bool
    is_verified: bool
    is_active: bool
    last_seen: Optional[datetime] = None
    is_online: bool = False
    created_at: datetime

    @model_validator(mode="after")
    def _add_country_meta(self):
        from .countries import COUNTRY_NAMES

        try:
            c = Country(self.country)
            self.country_name = COUNTRY_NAMES[c]
        except ValueError:
            self.country_name = self.country
        self.country_flag = flag_for(self.country)
        self.is_online = _is_online(self.last_seen)
        return self


class SignupRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    country: Country
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, max_length=32)

    @field_validator("full_name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Please enter your full name.")
        return v

    @field_validator("password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one letter and one number.")
        return v

    @model_validator(mode="after")
    def _passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=12)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _strong_password(cls, v: str) -> str:
        if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one letter and one number.")
        return v


# ---------- Country ----------
class CountryOut(BaseModel):
    code: str
    name: str
    flag: str


# ---------- Verification ----------
class VerifyRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=64)


class VerificationStatusOut(BaseModel):
    is_verified: bool
    attempts_remaining: int
    locked_until: Optional[datetime] = None


class VerifyResult(BaseModel):
    verified: bool
    message: str


# ---------- Admin ----------
class UserStatusUpdate(BaseModel):
    is_active: bool


class PasscodeCreate(BaseModel):
    label: str = Field(default="Verification passcode", max_length=120)
    code: str = Field(..., min_length=6, max_length=64)
    max_uses: int = Field(default=1, ge=1, le=10000)
    expires_in_hours: Optional[int] = Field(default=None, ge=1, le=24 * 365)


class PasscodeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    created_at: datetime
    expires_at: Optional[datetime]
    revoked: bool
    max_uses: int
    uses: int
    active: bool = False


class VerificationHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_name: str
    success: bool
    created_at: datetime
    ip: Optional[str] = None


class AdminStatsOut(BaseModel):
    total_users: int
    verified_users: int
    pending_users: int
    active_users: int
    online_users: int = 0
    total_messages: int
    unread_messages: int
    provider_configured: bool
    model_status: str
    model_name: str
    provider_name: str


class ModelHealthOut(BaseModel):
    provider_configured: bool
    provider_name: str
    model_name: str
    model_status: str
    last_success: Optional[datetime]
    recent_errors: int
    prediction_count: int


# ---------- Messaging ----------
class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    body: str
    sender: str
    created_at: datetime
    status: str
    read_at: Optional[datetime]


class MessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty.")
        return v


class ConversationOut(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    last_message: Optional[str] = None
    last_at: Optional[datetime] = None
    unread_for_user: int = 0
    unread_for_admin: int = 0
    is_verified: bool = False
    is_active: bool = True


# ---------- Markets / predictions ----------
class SeriesPoint(BaseModel):
    t: datetime
    c: float


class MarketQuoteOut(BaseModel):
    symbol: str
    price: Optional[float]
    change_abs: Optional[float]
    change_pct: Optional[float]
    day_open: Optional[float]
    day_high: Optional[float]
    day_low: Optional[float]
    source: str
    as_of: Optional[datetime]
    stale: bool
    available: bool
    series: List[SeriesPoint] = []


class PredictionOut(BaseModel):
    id: Optional[int] = None
    symbol: str
    name: str
    category: str
    timeframe: str
    horizon: str
    direction: str
    status: str
    probability: Optional[float] = None
    probability_label: Optional[str] = None
    explanation: str
    evidence: List[str] = []
    model_status: str
    model_name: str
    data_source: str
    data_as_of: Optional[datetime]
    generated_at: Optional[datetime]
    is_real: bool = False


class MarketResponse(BaseModel):
    market: str
    quotes: List[MarketQuoteOut]
    predictions: List[PredictionOut]
    provider_configured: bool
    message: Optional[str] = None


class InstrumentOut(BaseModel):
    symbol: str
    name: str
    category: str
    quote_currency: str
    provider_symbol: str


class ChartAnalysisOut(BaseModel):
    direction: str
    label: str
    tone: str
    confidence: Optional[float] = None
    confidence_label: Optional[str] = None
    source: str
    is_real: bool = False
    model_name: str
    explanation: str
    evidence: List[str] = []
    warnings: List[str] = []
    disclaimer: str


# ---------- Forex OHLC / trend analysis ----------
class CandleOut(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    complete: bool = True


class CandleWarningOut(BaseModel):
    code: str
    message: str
    count: Optional[int] = None


class DataSourceStatusOut(BaseModel):
    provider: str
    is_live: bool
    is_sample: bool
    available: bool
    symbol: str
    interval: str
    candles: int
    completed_candles: int
    latest_candle: Optional[datetime] = None
    latest_complete_candle: Optional[datetime] = None
    stale: bool = False
    message: Optional[str] = None


class IndicatorInfoOut(BaseModel):
    key: str
    name: str
    period: Optional[int] = None
    value: Optional[float] = None
    display: Optional[str] = None
    zone: Optional[str] = None
    what: str
    how: str
    contributes: str
    ready: bool = True


class SwingPointOut(BaseModel):
    kind: str
    index: int
    ts: datetime
    price: float
    confirmed: bool = True


class StructureOut(BaseModel):
    trend: str
    last_swing_high: Optional[SwingPointOut] = None
    last_swing_low: Optional[SwingPointOut] = None
    nearest_resistance: Optional[float] = None
    nearest_support: Optional[float] = None
    summary: str


class ForexCandlesOut(BaseModel):
    status: DataSourceStatusOut
    candles: List[CandleOut]
    warnings: List[CandleWarningOut] = []
    available_intervals: List[str] = []
    disclaimer: str


class IndicatorSeriesPoint(BaseModel):
    ts: datetime
    ema20: Optional[float] = None
    ema50: Optional[float] = None
    rsi14: Optional[float] = None
    adx14: Optional[float] = None
    atr14: Optional[float] = None


class ForexAnalysisOut(BaseModel):
    status: DataSourceStatusOut
    indicators: List[IndicatorInfoOut]
    structure: StructureOut
    series: List[IndicatorSeriesPoint] = []
    warnings: List[CandleWarningOut] = []
    disclaimer: str


class EvalBaselineOut(BaseModel):
    name: str
    description: str
    accuracy: Optional[float] = None
    samples: int = 0


class ForexEvaluationOut(BaseModel):
    symbol: str
    interval: str
    available: bool
    reason: Optional[str] = None
    strategy_name: str
    train_samples: int = 0
    test_samples: int = 0
    train_start: Optional[datetime] = None
    train_end: Optional[datetime] = None
    test_start: Optional[datetime] = None
    test_end: Optional[datetime] = None
    out_of_sample_accuracy: Optional[float] = None
    coverage: Optional[float] = None
    baselines: List[EvalBaselineOut] = []
    edge_vs_best_baseline: Optional[float] = None
    assumptions: List[str] = []
    uncertainty: List[str] = []
    disclaimer: str


class UnreadCountOut(BaseModel):
    user: int
    admin: int


# ---------- ChartMind (AI Chart Analyzer) ----------
class ChartLevelOut(BaseModel):
    kind: str  # "support" | "resistance"
    price: float
    touches: int
    strength: str  # "weak" | "moderate" | "strong"
    lower: Optional[float] = None
    upper: Optional[float] = None
    explanation: str


class PriceZoneOut(BaseModel):
    kind: str
    lower: float
    upper: float
    explanation: str


class FutureMarkerOut(BaseModel):
    ts: datetime
    candles_ahead: int
    note: str


class PipelineStageOut(BaseModel):
    key: str
    label: str
    detail: str
    ok: bool = True


class ScreenshotLevelOut(BaseModel):
    kind: str  # "support" | "resistance"
    price: float
    note: str = ""


class ScreenshotObservationOut(BaseModel):
    direction: str
    label: str
    tone: str
    source: str
    is_real: bool = False
    model_name: str
    explanation: str
    evidence: List[str] = []
    visible_levels_note: str
    instrument_hint: Optional[str] = None
    timeframe_hint: Optional[str] = None
    warnings: List[str] = []
    # --- Rich read (populated only by a real vision model) ---
    instrument: Optional[str] = None
    timeframe: Optional[str] = None
    trend: Optional[str] = None
    structure: Optional[str] = None
    current_price: Optional[float] = None
    price_axis_low: Optional[float] = None
    price_axis_high: Optional[float] = None
    entry: Optional[float] = None
    stop: Optional[float] = None
    target: Optional[float] = None
    levels: List[ScreenshotLevelOut] = []
    patterns: List[str] = []
    reasoning_steps: List[str] = []
    challenges: List[str] = []
    used_for_plan: bool = False


class TradePlanOut(BaseModel):
    """A data-derived risk/reward overlay drawn in chart (price & time) coordinates.

    Geometry is expressed purely in price/time values so the frontend can position
    rectangles through the same price->y / time->x transform as the candles; nothing
    here is in screen pixels, so overlays stay aligned on zoom, pan and timeframe change.
    """

    available: bool = False
    bias: str  # "BULLISH" | "BEARISH" | "NEUTRAL"
    entry: float
    entry_ts: datetime
    future_ts: datetime
    future_candles: int
    boundary: float  # horizontal line separating the two zones (the entry/reference price)
    body_lower: float  # grey "projection" rectangle, in price coordinates
    body_upper: float
    risk_lower: float  # red "risk" rectangle, in price coordinates
    risk_upper: float
    stop: float
    target: float
    reward_risk: Optional[float] = None
    atr: float
    source: str = "ohlc"  # "ohlc" (measured) | "screenshot" (vision-read levels)
    source_note: str = ""
    labels: Dict[str, str] = {}
    notes: List[str] = []
    explanation: str


class DemandZoneOut(BaseModel):
    """A horizontal support/demand (or resistance/supply) zone drawn across the chart."""

    role: str  # "demand" | "supply"
    lower: float
    upper: float
    price: float
    touches: int
    strength: str
    explanation: str
    since_ts: Optional[datetime] = None


class ChartMindResultOut(BaseModel):
    status: DataSourceStatusOut
    symbol: str
    interval: str
    requested_candles: int
    candles_analyzed: int
    candles: List[CandleOut] = []
    series: List[IndicatorSeriesPoint] = []
    indicators: List[IndicatorInfoOut] = []
    structure: StructureOut
    levels: List[ChartLevelOut] = []
    zones: List[PriceZoneOut] = []
    swings: List[SwingPointOut] = []
    future_marker: Optional[FutureMarkerOut] = None
    trade_plan: Optional[TradePlanOut] = None
    demand_zone: Optional[DemandZoneOut] = None
    summary: str
    limitations: List[str] = []
    warnings: List[CandleWarningOut] = []
    disclaimer: str
    screenshot: Optional[ScreenshotObservationOut] = None
    pipeline: List[PipelineStageOut] = []
    generated_at: datetime


class ChartMindHistoryItemOut(BaseModel):
    id: int
    title: str
    symbol: str
    interval: str
    trend: str
    direction: str
    data_source: str
    is_real: bool
    has_screenshot: bool
    candles_analyzed: int
    summary: str
    created_at: datetime


class ChartMindSavedOut(ChartMindHistoryItemOut):
    result: ChartMindResultOut


class ChartMindSaveRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=160)
    result: ChartMindResultOut
