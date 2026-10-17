import { Activity, Bitcoin, Coins, Filter, Minus, TrendingDown, TrendingUp, WifiOff } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { MarketCard } from "../components/market/MarketCard";
import { PredictionCard } from "../components/market/PredictionCard";
import { TrendChart } from "../components/market/TrendChart";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState, ErrorState, InfoBanner } from "../components/ui/States";
import { CardSkeleton } from "../components/ui/Spinner";
import { useMarket } from "../hooks/useMarket";
import { CATEGORY_META, cn, formatPct, formatPrice } from "../lib/utils";
import type { Direction, MarketCategory, MarketQuote, Prediction } from "../types";

const ICONS: Record<string, typeof TrendingUp> = {
  forex: TrendingUp,
  gold: Coins,
  crypto: Bitcoin,
  binary: Activity,
};

const VALID: MarketCategory[] = ["forex", "gold", "crypto", "binary"];

export function MarketPage() {
  const { category } = useParams<{ category: string }>();
  const cat = (category ?? "").toLowerCase() as MarketCategory;
  const valid = VALID.includes(cat);

  const { data, loading, error, reload } = useMarket(valid ? cat : "forex");

  const [instrument, setInstrument] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<string>("all");
  const [horizon, setHorizon] = useState<string>("all");

  const instruments = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, string>();
    data.predictions.forEach((p) => map.set(p.symbol, p.name));
    return Array.from(map.entries());
  }, [data]);

  const timeframes = useMemo(
    () => Array.from(new Set((data?.predictions ?? []).map((p) => p.timeframe))),
    [data]
  );
  const horizons = useMemo(
    () => Array.from(new Set((data?.predictions ?? []).map((p) => p.horizon))),
    [data]
  );

  const filtered = useMemo(() => {
    return (data?.predictions ?? []).filter(
      (p) =>
        (instrument === "all" || p.symbol === instrument) &&
        (timeframe === "all" || p.timeframe === timeframe) &&
        (horizon === "all" || p.horizon === horizon)
    );
  }, [data, instrument, timeframe, horizon]);

  const symbolPreds = useMemo(
    () => (data?.predictions ?? []).filter((p) => p.symbol === instrument),
    [data, instrument]
  );

  const selectedQuote = useMemo(
    () => (instrument !== "all" ? data?.quotes.find((q) => q.symbol === instrument) : undefined),
    [data, instrument]
  );

  const liveDirection: Direction = useMemo(() => {
    if (selectedQuote?.available && selectedQuote.change_pct != null) {
      if (selectedQuote.change_pct > 0) return "BULLISH";
      if (selectedQuote.change_pct < 0) return "BEARISH";
      return "NEUTRAL";
    }
    const bull = symbolPreds.filter((p) => p.direction === "BULLISH").length;
    const bear = symbolPreds.filter((p) => p.direction === "BEARISH").length;
    if (bull > bear) return "BULLISH";
    if (bear > bull) return "BEARISH";
    return "NEUTRAL";
  }, [selectedQuote, symbolPreds]);

  if (!valid) return <Navigate to="/" replace />;

  const meta = CATEGORY_META[cat];
  const Icon = ICONS[cat];

  const trendQuote = data?.quotes.find((q) => (q.series?.length ?? 0) > 3);
  const currentCount = filtered.filter((p) => p.status === "CURRENT").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5">
            <Icon className={`h-6 w-6 ${meta.accent}`} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">{meta.label}</h1>
            <p className="text-sm text-slate-400">{meta.blurb}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={currentCount > 0 ? "bull" : "muted"} dot>
            {currentCount} current
          </Badge>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>
            Refresh
          </Button>
        </div>
      </div>

      {cat === "binary" && (
        <InfoBanner tone="warn">
          Binary options carry a high risk of losing your entire stake. Outlooks shown here are
          informational directional reads only — no betting instructions or recommendations, and
          no guaranteed outcomes.
        </InfoBanner>
      )}

      {data && !data.provider_configured && (
        <InfoBanner tone="warn">
          <span className="inline-flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            {data.message ?? "Data provider not configured. Signals may be unavailable or sample."}
          </span>
        </InfoBanner>
      )}

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <Filter className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Filters</span>
          </div>
          <FilterSelect
            label="Instrument"
            value={instrument}
            onChange={setInstrument}
            options={[
              { value: "all", label: "All instruments" },
              ...instruments.map(([symbol, name]) => ({
                value: symbol,
                label: `${symbol} — ${name}`,
              })),
            ]}
          />
          <FilterSelect
            label="Timeframe"
            value={timeframe}
            onChange={setTimeframe}
            options={[
              { value: "all", label: "All timeframes" },
              ...timeframes.map((t) => ({ value: t, label: t })),
            ]}
          />
          <FilterSelect
            label="Horizon"
            value={horizon}
            onChange={setHorizon}
            options={[
              { value: "all", label: "All horizons" },
              ...horizons.map((h) => ({ value: h, label: h })),
            ]}
          />
        </div>
      </Card>

      {instrument !== "all" && (
        <LiveRead
          symbol={instrument}
          name={instruments.find(([s]) => s === instrument)?.[1] ?? ""}
          quote={selectedQuote}
          direction={liveDirection}
          predictions={symbolPreds}
          isSample={data ? !data.provider_configured : false}
        />
      )}

      {error && <ErrorState description={error} onRetry={() => void reload()} />}

      {/* Snapshot */}
      <Card>
        <CardHeader
          title="Market snapshot"
          subtitle={`${meta.label} instruments — genuine data when available`}
          icon={<Icon className="h-5 w-5" />}
        />
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : (data?.quotes.length ?? 0) === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No instruments configured.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data!.quotes.map((q) => (
              <MarketCard key={q.symbol} quote={q} />
            ))}
          </div>
        )}
      </Card>

      {/* Trend */}
      <Card>
        <CardHeader
          title="Historical trend"
          subtitle="Educational view — not a forecast"
          icon={<TrendingUp className="h-5 w-5" />}
        />
        {loading ? (
          <div className="h-[240px] animate-pulse rounded-xl bg-white/5" />
        ) : trendQuote ? (
          <TrendChart
            data={trendQuote.series ?? []}
            tone={
              (trendQuote.change_pct ?? 0) > 0
                ? "bull"
                : (trendQuote.change_pct ?? 0) < 0
                  ? "bear"
                  : "neutral"
            }
            label={`${trendQuote.symbol} · ${trendQuote.source}`}
          />
        ) : (
          <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-slate-600">
            Historical series unavailable.
          </div>
        )}
      </Card>

      {/* Predictions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Directional outlooks</h2>
          <span className="text-xs text-slate-500">{filtered.length} result(s)</span>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No outlooks match your filters"
            description="Try widening the instrument, timeframe or horizon filters. Predictions appear only when a validated engine produces a signal."
            icon={<Filter className="h-5 w-5" />}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setInstrument("all");
                  setTimeframe("all");
                  setHorizon("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p, i) => (
              <PredictionCard key={`${p.symbol}-${p.timeframe}-${i}`} prediction={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex min-w-[150px] flex-1 flex-col gap-1.5 sm:flex-none">
      <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-line bg-navy-900 px-3 text-sm text-white focus:border-bullish/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-navy-800">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

const READ_META: Record<
  Direction,
  { icon: typeof TrendingUp; label: string; sub: string; text: string; bg: string; ring: string }
> = {
  BULLISH: {
    icon: TrendingUp,
    label: "Bullish",
    sub: "Upward bias",
    text: "text-bullish",
    bg: "bg-bullish/10",
    ring: "ring-bullish/30",
  },
  BEARISH: {
    icon: TrendingDown,
    label: "Bearish",
    sub: "Downward bias",
    text: "text-bearish",
    bg: "bg-bearish/10",
    ring: "ring-bearish/30",
  },
  NEUTRAL: {
    icon: Minus,
    label: "Neutral",
    sub: "Sideways / indecisive",
    text: "text-neutral",
    bg: "bg-neutral/10",
    ring: "ring-neutral/30",
  },
};

function LiveRead({
  symbol,
  name,
  quote,
  direction,
  predictions,
  isSample,
}: {
  symbol: string;
  name: string;
  quote?: MarketQuote;
  direction: Direction;
  predictions: Prediction[];
  isSample: boolean;
}) {
  const meta = READ_META[direction];
  const Icon = meta.icon;

  return (
    <div className={cn("card animate-fade-in overflow-hidden p-0 ring-1", meta.ring)}>
      <div className={cn("flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between", meta.bg)}>
        <div className="flex items-center gap-4">
          <span className={cn("flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-950/40", meta.text)}>
            <Icon className="h-7 w-7" />
          </span>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              According to live market
            </p>
            <p className={cn("text-2xl font-bold leading-tight sm:text-3xl", meta.text)}>
              {meta.label}
            </p>
            <p className="text-xs text-slate-400">
              <span className="font-mono text-slate-300">{symbol}</span> · {name} · {meta.sub}
            </p>
          </div>
        </div>

        {quote && (
          <div className="text-left sm:text-right">
            <p className="font-mono text-xl font-semibold text-white">
              {formatPrice(quote.price)}
            </p>
            <p
              className={cn(
                "font-mono text-sm font-medium",
                (quote.change_pct ?? 0) > 0
                  ? "text-bullish"
                  : (quote.change_pct ?? 0) < 0
                    ? "text-bearish"
                    : "text-slate-400"
              )}
            >
              {formatPct(quote.change_pct)}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">
              {isSample ? "Sample data" : quote.source}
            </p>
          </div>
        )}
      </div>

      {predictions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Model outlook
          </span>
          {predictions.map((p) => {
            const m = READ_META[p.direction];
            return (
              <span
                key={`${p.timeframe}-${p.horizon}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                  p.status === "UNAVAILABLE" ? "text-slate-500" : m.text
                )}
              >
                <span className="text-slate-500">
                  {p.timeframe}/{p.horizon}
                </span>
                {p.status === "UNAVAILABLE" ? "n/a" : m.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
