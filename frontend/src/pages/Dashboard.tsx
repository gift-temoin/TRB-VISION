import {
  Activity,
  ArrowRight,
  Bitcoin,
  Brain,
  CandlestickChart,
  Coins,
  Info,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Signal,
  TrendingUp,
  WifiOff,
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { MarketCard } from "../components/market/MarketCard";
import { PredictionCard } from "../components/market/PredictionCard";
import { TrendChart } from "../components/market/TrendChart";
import { Badge, ModelBadge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { InfoBanner } from "../components/ui/States";
import { CardSkeleton } from "../components/ui/Spinner";
import { ErrorState } from "../components/ui/States";
import { useAuth } from "../context/AuthContext";
import { useAllMarkets } from "../hooks/useMarket";
import { CATEGORY_META } from "../lib/utils";
import type { MarketCategory } from "../types";

const CATEGORIES: { key: MarketCategory; icon: typeof TrendingUp }[] = [
  { key: "forex", icon: TrendingUp },
  { key: "gold", icon: Coins },
  { key: "crypto", icon: Bitcoin },
  { key: "binary", icon: Activity },
];

const TOOLS: { to: string; label: string; blurb: string; icon: typeof TrendingUp; accent: string }[] = [
  {
    to: "/chartmind",
    label: "AI Chart Analyzer",
    blurb: "Structure, levels & screenshot reading",
    icon: Brain,
    accent: "text-violet-400",
  },
  {
    to: "/forex",
    label: "Forex Trend Analysis",
    blurb: "Historical OHLC, indicators & structure",
    icon: CandlestickChart,
    accent: "text-sky-400",
  },
  {
    to: "/analyze",
    label: "Chart Analyzer",
    blurb: "Read a chart screenshot",
    icon: ScanLine,
    accent: "text-bullish",
  },
];

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "bull" | "warn";
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <span
          className={
            tone === "bull"
              ? "text-bullish"
              : tone === "warn"
                ? "text-neutral"
                : "text-slate-500"
          }
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAllMarkets([
    "forex",
    "gold",
    "crypto",
    "binary",
  ]);

  const allQuotes = useMemo(
    () =>
      Object.values(data).flatMap((r) =>
        r.quotes.map((q) => ({ ...q, category: r.market }))
      ),
    [data]
  );

  const allPredictions = useMemo(
    () => Object.values(data).flatMap((r) => r.predictions),
    [data]
  );

  const currentSignals = allPredictions.filter((p) => p.status === "CURRENT").length;
  const providerConfigured = Object.values(data).some((r) => r.provider_configured);
  const anyData = Object.keys(data).length > 0;

  const snapshot = allQuotes.slice(0, 4);
  const featured =
    allPredictions.find((p) => p.status === "CURRENT") ??
    allPredictions.find((p) => p.status !== "UNAVAILABLE") ??
    allPredictions[0];

  const trendSeries = useMemo(() => {
    const withSeries = allQuotes.find((q) => (q.series?.length ?? 0) > 3);
    return withSeries;
  }, [allQuotes]);

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white sm:text-2xl">
              Welcome back, {user?.full_name?.split(" ")[0] ?? "Trader"}
            </h1>
            <Badge tone="bull" dot>
              <ShieldCheck className="h-3 w-3" /> Verified
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            {today} · Directional market guidance &amp; outlooks
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} icon={<RefreshCw className="h-4 w-4" />}>
          Refresh
        </Button>
      </div>

      {!providerConfigured && anyData && (
        <InfoBanner tone="warn">
          <span className="inline-flex items-center gap-2">
            <WifiOff className="h-3.5 w-3.5" />
            A live market data provider is not configured. Prices and signals are shown as
            clearly-labelled sample data, or marked unavailable. Configure a provider on the
            server to enable genuine data.
          </span>
        </InfoBanner>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Markets"
          value="4"
          sub="Forex · Gold · Crypto · Binary"
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Instruments"
          value={loading ? "—" : String(allQuotes.length)}
          sub="Tracked across markets"
          icon={<Coins className="h-4 w-4" />}
        />
        <StatCard
          label="Current signals"
          value={loading ? "—" : String(currentSignals)}
          sub="Within validity window"
          icon={<Signal className="h-4 w-4" />}
          tone="bull"
        />
        <StatCard
          label="Model status"
          value={featured ? featured.model_status : providerConfigured ? "READY" : "UNCONFIGURED"}
          sub={featured?.model_name ?? "No provider configured"}
          icon={<Info className="h-4 w-4" />}
          tone={featured?.model_status === "CALIBRATED" ? "bull" : "warn"}
        />
      </div>

      {/* Market categories */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Market categories</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {CATEGORIES.map(({ key, icon: Icon }) => {
            const meta = CATEGORY_META[key];
            return (
              <Link
                key={key}
                to={`/market/${key}`}
                className="card card-hover group flex items-center gap-3 p-4"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 transition-colors group-hover:bg-bullish/10">
                  <Icon className={`h-5 w-5 ${meta.accent}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{meta.label}</p>
                  <p className="truncate text-[11px] text-slate-500">{meta.blurb}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-bullish" />
              </Link>
            );
          })}
        </div>
      </div>

      {error && <ErrorState description={error} onRetry={() => void reload()} />}

      {/* Analysis tools */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Analysis tools</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ to, label, blurb, icon: Icon, accent }) => (
            <Link key={to} to={to} className="card card-hover group flex items-center gap-3 p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 transition-colors group-hover:bg-bullish/10">
                <Icon className={`h-5 w-5 ${accent}`} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">{label}</p>
                <p className="truncate text-[11px] text-slate-500">{blurb}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-bullish" />
            </Link>
          ))}
        </div>
      </div>

      {/* Market snapshot */}
      <Card>
        <CardHeader
          title="Market snapshot"
          subtitle="Latest genuine prices when a provider is configured"
          icon={<Activity className="h-5 w-5" />}
          action={
            <Link to="/market/forex" className="text-xs font-medium text-bullish hover:underline">
              View all
            </Link>
          }
        />
        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : snapshot.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No market data available.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {snapshot.map((q) => (
              <MarketCard key={`${q.category}-${q.symbol}`} quote={q} />
            ))}
          </div>
        )}
      </Card>

      {/* Trend visualization + featured signal */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Historical trend"
            subtitle="Educational view of recent movement"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          {loading ? (
            <div className="h-[240px] animate-pulse rounded-xl bg-white/5" />
          ) : trendSeries ? (
            <TrendChart
              data={trendSeries.series ?? []}
              tone={
                (trendSeries.change_pct ?? 0) > 0
                  ? "bull"
                  : (trendSeries.change_pct ?? 0) < 0
                    ? "bear"
                    : "neutral"
              }
              label={`${trendSeries.symbol} · ${trendSeries.source}`}
            />
          ) : (
            <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-slate-600">
              Historical series unavailable — configure a data provider.
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Featured signal"
            subtitle="Most relevant current read"
            icon={<Signal className="h-5 w-5" />}
          />
          {loading ? (
            <CardSkeleton />
          ) : featured ? (
            <PredictionCard prediction={featured} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">
              No signals available.
            </p>
          )}
        </Card>
      </div>

      {/* Latest signals */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">Latest signals</h2>
          {featured && <ModelBadge status={featured.model_status} />}
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        ) : allPredictions.length === 0 ? (
          <Card>
            <p className="py-8 text-center text-sm text-slate-500">
              Signals will appear here once a prediction engine is configured and verified.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {allPredictions.slice(0, 6).map((p, i) => (
              <PredictionCard key={`${p.symbol}-${i}`} prediction={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
