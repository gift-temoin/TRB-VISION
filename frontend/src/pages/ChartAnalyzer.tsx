import {
  Image as ImageIcon,
  Info,
  Minus,
  RotateCcw,
  ScanLine,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { ErrorState, InfoBanner, InlineError } from "../components/ui/States";
import { api, ApiError } from "../lib/api";
import { cn } from "../lib/utils";
import type { ChartAnalysis } from "../types";

const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/jpg,image/webp";

const DIRECTION_META = {
  BULLISH: {
    icon: TrendingUp,
    tone: "bull" as const,
    label: "Bullish",
    sub: "Upward bias",
    ring: "ring-bullish/30",
    bg: "bg-bullish/10",
    text: "text-bullish",
  },
  BEARISH: {
    icon: TrendingDown,
    tone: "bear" as const,
    label: "Bearish",
    sub: "Downward bias",
    ring: "ring-bearish/30",
    bg: "bg-bearish/10",
    text: "text-bearish",
  },
  NEUTRAL: {
    icon: Minus,
    tone: "neutral" as const,
    label: "Neutral",
    sub: "Sideways / indecisive",
    ring: "ring-neutral/30",
    bg: "bg-neutral/10",
    text: "text-neutral",
  },
};

export function ChartAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChartAnalysis | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const pickFile = useCallback(
    (next: File | null | undefined) => {
      setError(null);
      setResult(null);
      if (!next) return;
      if (!next.type.startsWith("image/")) {
        setError("Please choose an image file (PNG, JPEG or WebP).");
        return;
      }
      if (next.size > MAX_BYTES) {
        setError("That image is larger than 6 MB. Please choose a smaller screenshot.");
        return;
      }
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(next);
      });
      setFile(next);
    },
    []
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const analyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.analyzeChart(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setFile(null);
    setResult(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const meta = result ? DIRECTION_META[result.direction] : null;
  const ResultIcon = meta?.icon ?? ScanLine;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
            <ScanLine className="h-6 w-6 text-bullish" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Chart Analyzer</h1>
            <p className="text-sm text-slate-400">
              Upload a chart screenshot and get an instant directional read.
            </p>
          </div>
        </div>
        {result && (
          <Button variant="secondary" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>
            Analyze another
          </Button>
        )}
      </div>

      <InfoBanner tone="info">
        <span className="inline-flex items-start gap-2">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This tool reads the price action in your screenshot and estimates an upward, downward
            or sideways bias. It is an educational aid — it does not place trades and never
            guarantees an outcome. Live signals come from the market pages, not this preview.
          </span>
        </span>
      </InfoBanner>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Upload */}
        <Card>
          <CardHeader
            title="Chart screenshot"
            subtitle="PNG, JPEG or WebP up to 6 MB"
            icon={<ImageIcon className="h-5 w-5" />}
          />

          {!preview ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                "flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center transition-colors",
                dragging
                  ? "border-bullish/60 bg-bullish/5"
                  : "border-line hover:border-bullish/40 hover:bg-white/5"
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-slate-300">
                <Upload className="h-6 w-6" />
              </span>
              <span className="text-sm font-medium text-white">
                Drop a chart screenshot here
              </span>
              <span className="text-xs text-slate-500">or click to browse your files</span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-line bg-navy-950">
                <img src={preview} alt="Chart preview" className="max-h-[360px] w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-xs text-slate-500">{file?.name}</span>
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={reset}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => void analyze()}
                    loading={loading}
                    icon={!loading ? <ScanLine className="h-4 w-4" /> : undefined}
                  >
                    {loading ? "Analyzing…" : "Analyze"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {error && (
            <div className="mt-4">
              <InlineError>{error}</InlineError>
            </div>
          )}

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-[11px] text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Tip: coloured candlestick charts (green/red) give the clearest read. Line or
            monochrome charts may return a neutral result.
          </div>
        </Card>

        {/* Result */}
        <Card>
          <CardHeader
            title="Directional read"
            subtitle="Result appears here after analysis"
            icon={<ScanLine className="h-5 w-5" />}
          />

          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-bullish border-t-transparent" />
              </span>
              <p className="text-sm text-slate-400">Reading the chart…</p>
            </div>
          ) : result && meta ? (
            <div className="space-y-5">
              <div className={cn("flex items-center gap-4 rounded-2xl p-4 ring-1", meta.bg, meta.ring)}>
                <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-950/40", meta.text)}>
                  <ResultIcon className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Most likely bias
                  </p>
                  <p className={cn("text-2xl font-bold leading-tight", meta.text)}>{meta.label}</p>
                  <p className="text-xs text-slate-400">{meta.sub}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={meta.tone} dot>
                  {result.direction}
                </Badge>
                <Badge tone={result.is_real ? "info" : "muted"}>{result.source}</Badge>
                {result.confidence !== null && (
                  <Badge tone="muted">
                    {Math.round(result.confidence * 100)}% · {result.confidence_label ?? "estimate"}
                  </Badge>
                )}
              </div>

              <p className="text-sm leading-relaxed text-slate-300">{result.explanation}</p>

              {result.evidence.length > 0 && (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                    What it noticed
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {result.evidence.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-2">
                  {result.warnings.map((w, i) => (
                    <InfoBanner key={i} tone="warn">
                      {w}
                    </InfoBanner>
                  ))}
                </div>
              )}

              <div className="flex items-start gap-2 rounded-xl border border-neutral/25 bg-neutral/8 px-3 py-2.5 text-[11px] text-amber-200">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {result.disclaimer}
              </div>

              <p className="text-[11px] text-slate-500">Engine: {result.model_name}</p>
            </div>
          ) : error ? (
            <ErrorState description={error} onRetry={() => void analyze()} />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
                <ScanLine className="h-5 w-5" />
              </span>
              <p className="text-sm text-slate-400">
                Upload a chart screenshot to see a directional read.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
