import {
  Brain,
  Image as ImageIcon,
  RefreshCw,
  Save,
  ScanLine,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalysisHistory } from "../components/chartmind/AnalysisHistory";
import { ChartMindChart } from "../components/chartmind/ChartMindChart";
import { ChartMindResults } from "../components/chartmind/ChartMindResults";
import { LoadingStages } from "../components/chartmind/LoadingStages";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { ErrorState, InfoBanner, InlineError } from "../components/ui/States";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import type { ChartMindHistoryItem, ChartMindResult, ForexCandlesResponse } from "../types";

const SYMBOLS = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "XAU/USD", "BTC/USD", "ETH/USD"];
const INTERVALS = ["M1", "M5", "M15", "M30", "H1", "H4", "D1"];
const CANDLE_COUNTS = [60, 100, 200, 400];
const PROJECTIONS = [0, 5, 10, 20];

const SYMBOL_ALIASES: Record<string, string> = {
  EURUSD: "EUR/USD",
  GBPUSD: "GBP/USD",
  "USDJPY": "USD/JPY",
  AUDUSD: "AUD/USD",
  XAUUSD: "XAU/USD",
  GOLD: "XAU/USD",
  XAGUSD: "XAG/USD",
  SILVER: "XAG/USD",
  BTCUSD: "BTC/USD",
  BTC: "BTC/USD",
  BITCOIN: "BTC/USD",
  ETHUSD: "ETH/USD",
  ETH: "ETH/USD",
  ETHEREUM: "ETH/USD",
};

const INTERVAL_ALIASES: Record<string, string> = {
  "1M": "M1",
  "1MIN": "M1",
  M1: "M1",
  "5M": "M5",
  "5MIN": "M5",
  M5: "M5",
  "15M": "M15",
  "15MIN": "M15",
  M15: "M15",
  "30M": "M30",
  "30MIN": "M30",
  M30: "M30",
  "1H": "H1",
  H1: "H1",
  "60M": "H1",
  "4H": "H4",
  H4: "H4",
  "240M": "H4",
  "1D": "D1",
  D1: "D1",
  DAILY: "D1",
  "1DAY": "D1",
};

function matchSymbol(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (SYMBOL_ALIASES[compact]) return SYMBOL_ALIASES[compact];
  for (const s of SYMBOLS) if (compact.includes(s.replace("/", ""))) return s;
  for (const [k, v] of Object.entries(SYMBOL_ALIASES)) if (compact.includes(k)) return v;
  return null;
}

function matchInterval(raw: string | null): string | null {
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return INTERVAL_ALIASES[compact] ?? null;
}

const FETCH_STAGES = [
  "Connecting to the data source",
  "Fetching historical candles",
  "Validating candle history",
];

const ANALYZE_STAGES = [
  "Connecting to the data source",
  "Fetching requested candles",
  "Validating candle history",
  "Classifying market structure",
  "Locating support & resistance",
  "Preparing chart overlays",
  "Reading uploaded screenshot",
];

export function ChartMind() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [interval, setInterval_] = useState("H1");
  const [candleCount, setCandleCount] = useState(100);
  const [projection, setProjection] = useState(0);

  const [preview, setPreview] = useState<ForexCandlesResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [result, setResult] = useState<ChartMindResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [shotInstrument, setShotInstrument] = useState("");
  const [shotTimeframe, setShotTimeframe] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [history, setHistory] = useState<ChartMindHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);

  const [overlays, setOverlays] = useState({
    levels: true,
    zones: true,
    swings: true,
    tradePlan: true,
    demand: true,
  });

  // ---- Phase 1: honest preview of the real validated candle series ----------
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await api.forexCandles(symbol, interval);
      setPreview(data);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "Failed to load candle history.");
    } finally {
      setPreviewLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await api.chartMindHistory());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  // Screenshot preview lifecycle
  useEffect(() => {
    if (!screenshot) {
      setScreenshotUrl(null);
      return;
    }
    const url = URL.createObjectURL(screenshot);
    setScreenshotUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [screenshot]);

  const resetTerminal = () => {
    setResult(null);
    setAnalyzeError(null);
    setSavedId(null);
    setSaveMessage(null);
  };

  const onSelectFile = (file: File | null) => {
    if (file && !file.type.startsWith("image/")) {
      setAnalyzeError("Only PNG, JPEG or WebP images are supported.");
      return;
    }
    setAnalyzeError(null);
    setScreenshot(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runAnalysis = async (override?: { symbol?: string; interval?: string }) => {
    const sym = override?.symbol ?? symbol;
    const iv = override?.interval ?? interval;
    setAnalyzing(true);
    setAnalyzeError(null);
    setSavedId(null);
    setSaveMessage(null);
    setResult(null);
    setActiveId(null);
    try {
      const data = await api.chartMindAnalyze({
        symbol: sym,
        interval: iv,
        candles: candleCount,
        futureCandles: projection,
        screenshot,
        screenshotInstrument: shotInstrument,
        screenshotTimeframe: shotTimeframe,
      });
      setResult(data);
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const suggestion = useMemo(() => {
    const shot = result?.screenshot;
    if (!shot?.is_real) return null;
    const sym = matchSymbol(shot.instrument);
    const iv = matchInterval(shot.timeframe);
    const needSym = sym != null && sym !== symbol;
    const needIv = iv != null && iv !== interval;
    if (!needSym && !needIv) return null;
    return {
      symbol: needSym ? sym! : symbol,
      interval: needIv ? iv! : interval,
      detected: [shot.instrument, shot.timeframe].filter(Boolean).join(" · "),
    };
  }, [result, symbol, interval]);

  const applySuggestion = (sym: string, iv: string) => {
    setSymbol(sym);
    setInterval_(iv);
    void runAnalysis({ symbol: sym, interval: iv });
  };

  const saveAnalysis = async () => {
    if (!result) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const saved = await api.chartMindSave(result);
      setSavedId(saved.id);
      setActiveId(saved.id);
      setSaveMessage("Saved to your analyses.");
      await loadHistory();
    } catch (err) {
      setSaveMessage(err instanceof ApiError ? err.message : "Could not save analysis.");
    } finally {
      setSaving(false);
    }
  };

  const openSaved = async (id: number) => {
    try {
      const saved = await api.chartMindGet(id);
      setResult(saved.result);
      setSymbol(saved.symbol);
      setInterval_(saved.interval);
      setActiveId(id);
      setSavedId(id);
      setAnalyzeError(null);
      setSaveMessage(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : "Could not open that analysis.");
    }
  };

  const deleteSaved = async (id: number) => {
    try {
      await api.chartMindDelete(id);
      if (activeId === id) {
        resetTerminal();
        setActiveId(null);
      }
      await loadHistory();
    } catch {
      /* silent — list refresh will reflect reality */
    }
  };

  const analyzeStages = screenshot ? ANALYZE_STAGES : ANALYZE_STAGES.slice(0, -1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/25 to-sky-500/20">
            <Brain className="h-6 w-6 text-violet-300" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">AI Chart Analyzer</h1>
            <p className="text-sm text-slate-400">
              Measured structure, levels &amp; indicators — plus optional screenshot reading.
            </p>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void loadPreview()}
          icon={<RefreshCw className="h-4 w-4" />}
        >
          Refresh data
        </Button>
      </div>

      <InfoBanner>
        ChartMind analyses <strong>real market candles</strong> and, when you upload a screenshot,
        reads it with a vision model — showing every reasoning step it took. It does{" "}
        <strong>not</strong> access any private TradingView data or predict guaranteed outcomes.
        Everything here is educational, not financial advice.
      </InfoBanner>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {/* Controls */}
          <Card>
            <CardHeader
              title="Configure analysis"
              subtitle="Choose a market and timeframe, optionally attach a chart screenshot"
              icon={<ScanLine className="h-5 w-5" />}
            />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Selector label="Market" value={symbol} onChange={setSymbol} options={SYMBOLS} />
              <Selector label="Timeframe" value={interval} onChange={setInterval_} options={INTERVALS} />
              <Selector
                label="Candles"
                value={String(candleCount)}
                onChange={(v) => setCandleCount(Number(v))}
                options={CANDLE_COUNTS.map(String)}
              />
              <Selector
                label="Future marker"
                value={String(projection)}
                onChange={(v) => setProjection(Number(v))}
                options={PROJECTIONS.map(String)}
              />
            </div>

            {/* Screenshot upload */}
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Chart screenshot (optional)
              </p>
              {screenshot && screenshotUrl ? (
                <div className="flex items-start gap-3 rounded-xl border border-line bg-navy-900/40 p-3">
                  <img
                    src={screenshotUrl}
                    alt="Uploaded chart preview"
                    className="h-20 w-32 rounded-lg object-cover ring-1 ring-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-white">{screenshot.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {(screenshot.size / 1024).toFixed(0)} KB · {(screenshot.type || "image").replace("image/", "")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <input
                        className="h-8 w-28 rounded-lg border border-line bg-navy-900 px-2 text-xs text-white placeholder:text-slate-600 focus:border-bullish/60 focus:outline-none"
                        placeholder="Instrument"
                        value={shotInstrument}
                        onChange={(e) => setShotInstrument(e.target.value)}
                      />
                      <input
                        className="h-8 w-24 rounded-lg border border-line bg-navy-900 px-2 text-xs text-white placeholder:text-slate-600 focus:border-bullish/60 focus:outline-none"
                        placeholder="Timeframe"
                        value={shotTimeframe}
                        onChange={(e) => setShotTimeframe(e.target.value)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setScreenshot(null);
                          setShotInstrument("");
                          setShotTimeframe("");
                        }}
                        icon={<X className="h-3.5 w-3.5" />}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line px-4 py-5 text-sm text-slate-400 transition-colors hover:border-bullish/40 hover:text-slate-200"
                >
                  <Upload className="h-4 w-4" />
                  Upload a chart image (PNG / JPEG / WebP)
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => onSelectFile(e.target.files?.[0] ?? null)}
              />
              <p className="mt-1.5 text-[10px] text-slate-600">
                Images are analysed in memory and never stored. Only derived observations are kept if
                you save the analysis.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                onClick={() => void runAnalysis()}
                loading={analyzing}
                icon={!analyzing ? <Sparkles className="h-4 w-4" /> : undefined}
              >
                {analyzing ? "Analyzing…" : "Analyze chart"}
              </Button>
              {result && savedId == null && (
                <Button
                  variant="outline"
                  onClick={() => void saveAnalysis()}
                  loading={saving}
                  icon={<Save className="h-4 w-4" />}
                >
                  Save analysis
                </Button>
              )}
              {result && (
                <Button
                  variant="ghost"
                  onClick={resetTerminal}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  Discard
                </Button>
              )}
              {savedId != null && (
                <span className="text-xs text-slate-500">Saved analysis #{savedId}</span>
              )}
              {saveMessage && <span className="text-xs text-bullish">{saveMessage}</span>}
            </div>

            {analyzeError && <div className="mt-3"><InlineError>{analyzeError}</InlineError></div>}
          </Card>

          {/* Result / loading / preview */}
          {analyzing ? (
            <LoadingStages
              stages={analyzeStages}
              active
              title={screenshot ? "Reading chart & screenshot…" : "Analyzing chart…"}
              note="Levels are derived from confirmed swing points. No price forecast is produced."
            />
          ) : result ? (
            <>
              {suggestion && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/25 bg-sky-500/8 px-4 py-3">
                  <Sparkles className="h-4 w-4 text-sky-300" />
                  <p className="text-xs text-slate-300">
                    Your screenshot looks like{" "}
                    <span className="font-semibold text-white">{suggestion.detected}</span>. Re-run
                    the analysis against the matching market data?
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-auto"
                    onClick={() => applySuggestion(suggestion.symbol, suggestion.interval)}
                  >
                    Analyze {suggestion.symbol} · {suggestion.interval}
                  </Button>
                </div>
              )}
              <Card>
                <CardHeader
                  title="Annotated chart"
                  subtitle={`${result.symbol} · ${result.interval} · ${result.levels.length} level(s) · ${result.swings.length} swing(s)`}
                  icon={<ImageIcon className="h-5 w-5" />}
                />
                <OverlayToggles
                  value={overlays}
                  onChange={setOverlays}
                  hasTradePlan={!!result.trade_plan?.available}
                  hasDemand={!!result.demand_zone}
                />
                <ChartMindChart
                  candles={result.candles}
                  series={result.series}
                  levels={result.levels}
                  zones={result.zones}
                  swings={result.swings}
                  futureMarker={result.future_marker}
                  tradePlan={result.trade_plan}
                  demandZone={result.demand_zone}
                  showLevels={overlays.levels}
                  showZones={overlays.zones}
                  showSwings={overlays.swings}
                  showTradePlan={overlays.tradePlan}
                  showDemand={overlays.demand}
                  label={`${result.symbol} · ${result.interval} · ${result.status.provider}`}
                />
              </Card>
              <ChartMindResults result={result} />
            </>
          ) : previewError ? (
            <ErrorState description={previewError} onRetry={() => void loadPreview()} />
          ) : previewLoading ? (
            <LoadingStages stages={FETCH_STAGES} active title="Loading market data…" />
          ) : preview ? (
            <Card>
              <CardHeader
                title="Market preview"
                subtitle={`${preview.status.completed_candles} completed candles · ${preview.status.provider}`}
                icon={<ImageIcon className="h-5 w-5" />}
              />
              <ChartMindChart
                candles={preview.candles}
                showLevels={overlays.levels}
                showZones={overlays.zones}
                showSwings={overlays.swings}
                showTradePlan={overlays.tradePlan}
                showDemand={overlays.demand}
                label={`${symbol} · ${interval} · preview`}
                height={320}
              />
              <div className="mt-3 rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-slate-400">
                Press <span className="font-semibold text-slate-200">Analyze chart</span> to detect
                structure, support/resistance and zones.
              </div>
            </Card>
          ) : null}
        </div>

        {/* History column */}
        <div className="space-y-6">
          <AnalysisHistory
            items={history}
            loading={historyLoading}
            activeId={activeId}
            onOpen={(id) => void openSaved(id)}
            onDelete={(id) => void deleteSaved(id)}
          />
        </div>
      </div>
    </div>
  );
}

function Selector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-line bg-navy-900 px-3 text-sm text-white focus:border-bullish/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-navy-800">
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

interface OverlayState {
  levels: boolean;
  zones: boolean;
  swings: boolean;
  tradePlan: boolean;
  demand: boolean;
}

function OverlayToggles({
  value,
  onChange,
  hasTradePlan,
  hasDemand,
}: {
  value: OverlayState;
  onChange: (v: OverlayState) => void;
  hasTradePlan: boolean;
  hasDemand: boolean;
}) {
  const items: { key: keyof OverlayState; label: string; enabled: boolean }[] = [
    { key: "tradePlan", label: "Risk / reward", enabled: true },
    { key: "demand", label: "Demand zone", enabled: true },
    { key: "levels", label: "S/R levels", enabled: true },
    { key: "zones", label: "S/R bands", enabled: true },
    { key: "swings", label: "Swings", enabled: true },
  ];
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Overlays</span>
      {items.map((it) => {
        const on = value[it.key];
        const dim = (it.key === "tradePlan" && !hasTradePlan) || (it.key === "demand" && !hasDemand);
        return (
          <button
            key={it.key}
            type="button"
            disabled={dim}
            onClick={() => onChange({ ...value, [it.key]: !on })}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              dim
                ? "cursor-not-allowed border-line text-slate-600 opacity-50"
                : on
                  ? "border-bullish/40 bg-bullish/12 text-bullish"
                  : "border-line text-slate-400 hover:text-slate-200"
            )}
            aria-pressed={on}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
