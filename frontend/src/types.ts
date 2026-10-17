export type MarketCategory = "forex" | "gold" | "crypto" | "binary";

export type Direction = "BULLISH" | "BEARISH" | "NEUTRAL";
export type SignalStatus = "CURRENT" | "EXPIRED" | "UNAVAILABLE";
export type ModelStatus = "CALIBRATED" | "UNCALIBRATED" | "DEGRADED" | "OFFLINE";

export type CountryCode = "RW" | "BI" | "UG" | "TZ" | "KE";

export interface User {
  id: number;
  full_name: string;
  email: string;
  country: CountryCode | string;
  country_name?: string;
  country_flag?: string;
  phone?: string | null;
  is_admin: boolean;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Instrument {
  symbol: string;
  name: string;
  category: MarketCategory;
  quote_currency: string;
  provider_symbol: string;
}

export interface ChartAnalysis {
  direction: Direction;
  label: string;
  tone: "bull" | "bear" | "neutral";
  confidence: number | null;
  confidence_label: string | null;
  source: string;
  is_real: boolean;
  model_name: string;
  explanation: string;
  evidence: string[];
  warnings: string[];
  disclaimer: string;
}

export interface MarketQuote {
  symbol: string;
  price: number | null;
  change_abs: number | null;
  change_pct: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  source: string;
  as_of: string | null;
  stale: boolean;
  available: boolean;
  series?: { t: string; c: number }[];
}

export interface Prediction {
  id: number | null;
  symbol: string;
  name: string;
  category: MarketCategory;
  timeframe: string;
  horizon: string;
  direction: Direction;
  status: SignalStatus;
  probability: number | null;
  probability_label: string | null;
  explanation: string;
  evidence: string[];
  model_status: ModelStatus;
  model_name: string;
  data_source: string;
  data_as_of: string | null;
  generated_at: string | null;
  is_real: boolean;
}

export interface PredictionResponse {
  market: MarketCategory;
  quotes: MarketQuote[];
  predictions: Prediction[];
  provider_configured: boolean;
  message: string | null;
}

export interface VerificationStatus {
  is_verified: boolean;
  attempts_remaining: number;
  locked_until: string | null;
}

export interface Message {
  id: number;
  body: string;
  sender: "user" | "admin";
  created_at: string;
  status: "sent" | "delivered" | "read";
  read_at: string | null;
}

export interface Conversation {
  id: number;
  user_id: number;
  user_name?: string;
  last_message: string | null;
  last_at: string | null;
  unread_for_user: number;
  unread_for_admin: number;
  is_verified: boolean;
  is_active: boolean;
}

export interface AdminStats {
  total_users: number;
  verified_users: number;
  pending_users: number;
  active_users: number;
  online_users?: number;
  total_messages: number;
  unread_messages: number;
  provider_configured: boolean;
  model_status: ModelStatus;
  model_name: string;
  provider_name: string;
}

export interface Passcode {
  id: number;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked: boolean;
  max_uses: number;
  uses: number;
  active: boolean;
}

// ---------- Forex OHLC / trend analysis ----------
export interface ForexCandle {
  ts: string;
  open: number;
  high: number;
  low: number;
  close: number;
  complete: boolean;
}

export interface CandleWarning {
  code: string;
  message: string;
  count: number | null;
}

export interface DataSourceStatus {
  provider: string;
  is_live: boolean;
  is_sample: boolean;
  available: boolean;
  symbol: string;
  interval: string;
  candles: number;
  completed_candles: number;
  latest_candle: string | null;
  latest_complete_candle: string | null;
  stale: boolean;
  message: string | null;
}

export interface ForexIndicator {
  key: string;
  name: string;
  period: number | null;
  value: number | null;
  display: string | null;
  zone: string | null;
  what: string;
  how: string;
  contributes: string;
  ready: boolean;
}

export interface SwingPoint {
  kind: string;
  index: number;
  ts: string;
  price: number;
  confirmed: boolean;
}

export interface ForexStructure {
  trend: string;
  last_swing_high: SwingPoint | null;
  last_swing_low: SwingPoint | null;
  nearest_resistance: number | null;
  nearest_support: number | null;
  summary: string;
}

export interface IndicatorSeriesPoint {
  ts: string;
  ema20: number | null;
  ema50: number | null;
  rsi14: number | null;
  adx14: number | null;
  atr14: number | null;
}

export interface ForexCandlesResponse {
  status: DataSourceStatus;
  candles: ForexCandle[];
  warnings: CandleWarning[];
  available_intervals: string[];
  disclaimer: string;
}

export interface ForexAnalysisResponse {
  status: DataSourceStatus;
  indicators: ForexIndicator[];
  structure: ForexStructure;
  series: IndicatorSeriesPoint[];
  warnings: CandleWarning[];
  disclaimer: string;
}

export interface EvalBaseline {
  name: string;
  description: string;
  accuracy: number | null;
  samples: number;
}

export interface ForexEvaluation {
  symbol: string;
  interval: string;
  available: boolean;
  reason: string | null;
  strategy_name: string;
  train_samples: number;
  test_samples: number;
  train_start: string | null;
  train_end: string | null;
  test_start: string | null;
  test_end: string | null;
  out_of_sample_accuracy: number | null;
  coverage: number | null;
  baselines: EvalBaseline[];
  edge_vs_best_baseline: number | null;
  assumptions: string[];
  uncertainty: string[];
  disclaimer: string;
}

// ---------- ChartMind (AI Chart Analyzer) ----------
export interface ChartLevel {
  kind: "support" | "resistance";
  price: number;
  touches: number;
  strength: string;
  lower: number | null;
  upper: number | null;
  explanation: string;
}

export interface PriceZone {
  kind: string;
  lower: number;
  upper: number;
  explanation: string;
}

export interface FutureMarker {
  ts: string;
  candles_ahead: number;
  note: string;
}

export interface PipelineStage {
  key: string;
  label: string;
  detail: string;
  ok: boolean;
}

export interface ScreenshotLevel {
  kind: "support" | "resistance";
  price: number;
  note: string;
}

export interface ScreenshotObservation {
  direction: Direction;
  label: string;
  tone: "bull" | "bear" | "neutral";
  source: string;
  is_real: boolean;
  model_name: string;
  explanation: string;
  evidence: string[];
  visible_levels_note: string;
  instrument_hint: string | null;
  timeframe_hint: string | null;
  warnings: string[];
  instrument: string | null;
  timeframe: string | null;
  trend: "UP" | "DOWN" | "RANGE" | null;
  structure: string | null;
  current_price: number | null;
  price_axis_low: number | null;
  price_axis_high: number | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  levels: ScreenshotLevel[];
  patterns: string[];
  reasoning_steps: string[];
  challenges: string[];
  used_for_plan: boolean;
}

export interface TradePlan {
  available: boolean;
  bias: Direction;
  entry: number;
  entry_ts: string;
  future_ts: string;
  future_candles: number;
  boundary: number;
  body_lower: number;
  body_upper: number;
  risk_lower: number;
  risk_upper: number;
  stop: number;
  target: number;
  reward_risk: number | null;
  atr: number;
  source: "ohlc" | "screenshot";
  source_note: string;
  labels: Record<string, string>;
  notes: string[];
  explanation: string;
}

export interface DemandZone {
  role: "demand" | "supply";
  lower: number;
  upper: number;
  price: number;
  touches: number;
  strength: string;
  explanation: string;
  since_ts: string | null;
}

export interface ChartMindResult {
  status: DataSourceStatus;
  symbol: string;
  interval: string;
  requested_candles: number;
  candles_analyzed: number;
  candles: ForexCandle[];
  series: IndicatorSeriesPoint[];
  indicators: ForexIndicator[];
  structure: ForexStructure;
  levels: ChartLevel[];
  zones: PriceZone[];
  swings: SwingPoint[];
  future_marker: FutureMarker | null;
  trade_plan: TradePlan | null;
  demand_zone: DemandZone | null;
  summary: string;
  limitations: string[];
  warnings: CandleWarning[];
  disclaimer: string;
  screenshot: ScreenshotObservation | null;
  pipeline: PipelineStage[];
  generated_at: string;
}

export interface ChartMindHistoryItem {
  id: number;
  title: string;
  symbol: string;
  interval: string;
  trend: string;
  direction: Direction;
  data_source: string;
  is_real: boolean;
  has_screenshot: boolean;
  candles_analyzed: number;
  summary: string;
  created_at: string;
}

export interface ChartMindSaved extends ChartMindHistoryItem {
  result: ChartMindResult;
}
