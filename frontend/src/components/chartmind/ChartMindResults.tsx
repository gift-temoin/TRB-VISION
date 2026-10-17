import { useMemo, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Minus,
  Ruler,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { ChartMindResult } from "../../types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { cn, formatPrice } from "../../lib/utils";
import { DataSourceStatus } from "../forex/DataSourceStatus";
import { IndicatorPanel } from "../forex/IndicatorPanel";

const TREND_META: Record<string, { label: string; tone: "bull" | "bear" | "neutral" | "muted" }> = {
  UP: { label: "Uptrend", tone: "bull" },
  DOWN: { label: "Downtrend", tone: "bear" },
  RANGE: { label: "Sideways", tone: "neutral" },
  UNKNOWN: { label: "Insufficient data", tone: "muted" },
};

const DIR_META = {
  BULLISH: { icon: TrendingUp, tone: "bull" as const, label: "Bullish bias" },
  BEARISH: { icon: TrendingDown, tone: "bear" as const, label: "Bearish bias" },
  NEUTRAL: { icon: Minus, tone: "neutral" as const, label: "Sideways / neutral" },
};

export function ChartMindResults({ result }: { result: ChartMindResult }) {
  const trend = TREND_META[result.structure.trend] ?? TREND_META.UNKNOWN;
  const direction = result.screenshot
    ? result.screenshot.direction
    : result.structure.trend === "UP"
      ? "BULLISH"
      : result.structure.trend === "DOWN"
        ? "BEARISH"
        : "NEUTRAL";
  const dir = DIR_META[direction];
  const DirIcon = dir.icon;

  return (
    <div className="space-y-6">
      <DataSourceStatus status={result.status} warnings={result.warnings} />

      <Card>
        <CardHeader
          title="Analysis results"
          subtitle={`${result.symbol} · ${result.interval} · ${result.candles_analyzed} candles analysed`}
          icon={<ListChecks className="h-5 w-5" />}
          action={
            <Badge tone={result.status.is_live ? "bull" : "muted"} dot>
              {result.status.is_live ? "LIVE" : result.status.is_sample ? "SAMPLE" : "UNAVAILABLE"}
            </Badge>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-navy-900/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Market structure
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge tone={trend.tone}>{trend.label}</Badge>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-navy-900/50 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              Directional read
            </p>
            <p className={cn("mt-1 inline-flex items-center gap-1.5 text-sm font-semibold",
              direction === "BULLISH" ? "text-bullish" : direction === "BEARISH" ? "text-bearish" : "text-neutral")}>
              <DirIcon className="h-4 w-4" />
              {dir.label}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-300">{result.summary}</p>
      </Card>

      <TradePlanPanel result={result} />

      <LevelsPanel result={result} />

      <Card>
        <CardHeader title="Indicators" subtitle="Computed on completed candles" icon={<Ruler className="h-5 w-5" />} />
        <IndicatorPanel indicators={result.indicators} structure={result.structure} />
      </Card>

      {result.screenshot && <ScreenshotPanel result={result} />}

      <Card>
        <CardHeader title="Data limitations & uncertainty" icon={<ShieldAlert className="h-5 w-5" />} />
        <ul className="space-y-2">
          {result.limitations.map((l, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
              {l}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral/25 bg-neutral/8 px-3 py-2.5 text-[11px] text-amber-200">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {result.disclaimer}
        </div>
      </Card>

      <PipelinePanel result={result} />
    </div>
  );
}

function LevelsPanel({ result }: { result: ChartMindResult }) {
  const empty = result.levels.length === 0;
  return (
    <Card>
      <CardHeader
        title="Support, resistance & price zones"
        subtitle="Derived from confirmed swing highs/lows and ATR"
        icon={<Layers className="h-5 w-5" />}
      />
      {empty ? (
        <p className="rounded-xl bg-white/5 px-3 py-3 text-xs text-slate-400">
          No reliably measurable support/resistance clusters were detected in this window. Try a
          longer candle count or a different timeframe.
        </p>
      ) : (
        <div className="space-y-2.5">
          {result.levels.map((lvl, i) => (
            <div key={i} className="rounded-xl border border-line bg-navy-900/40 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone={lvl.kind === "support" ? "bull" : "bear"}>
                    {lvl.kind === "support" ? "Support" : "Resistance"}
                  </Badge>
                  <span
                    className={cn(
                      "font-mono text-sm",
                      lvl.kind === "support" ? "text-bullish" : "text-bearish"
                    )}
                  >
                    {formatPrice(lvl.price, 5)}
                  </span>
                </div>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {lvl.strength} · {lvl.touches} touch{lvl.touches === 1 ? "" : "es"}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{lvl.explanation}</p>
            </div>
          ))}
          {result.zones.length > 0 && (
            <p className="pt-1 text-[11px] text-slate-500">
              {result.zones.length} shaded zone(s) drawn on the chart, one per level (±0.5×ATR wide).
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function TradePlanPanel({ result }: { result: ChartMindResult }) {
  const plan = result.trade_plan;
  const demand = result.demand_zone;
  if ((!plan || !plan.available) && !demand) return null;

  const biasTone = plan?.bias === "BULLISH" ? "bull" : plan?.bias === "BEARISH" ? "bear" : "neutral";

  return (
    <Card>
      <CardHeader
        title="Risk / reward overlay"
        subtitle={
          plan?.source === "screenshot"
            ? "Entry, stop & target read from your screenshot — drawn in real price & time coordinates"
            : "Rectangles drawn in real price & time coordinates on the chart above"
        }
        icon={<Target className="h-5 w-5" />}
        action={
          plan?.available ? (
            <div className="flex items-center gap-2">
              {plan.source === "screenshot" && <Badge tone="info">From screenshot</Badge>}
              <Badge tone={biasTone}>{plan.bias}</Badge>
            </div>
          ) : undefined
        }
      />

      {plan?.available && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Entry / reference" value={formatPrice(plan.entry, 5)} />
            <Metric label="Stop (risk)" value={formatPrice(plan.stop, 5)} tone="bear" />
            <Metric label="Target" value={formatPrice(plan.target, 5)} tone="bull" />
            <Metric
              label="Reward : risk"
              value={plan.reward_risk != null ? `1 : ${plan.reward_risk}` : "range"}
            />
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-navy-900/50 px-3.5 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {plan.labels.body || "Projection"} (grey)
              </p>
              <p className="mt-1 font-mono text-sm text-slate-300">
                {formatPrice(Math.min(plan.body_lower, plan.body_upper), 5)} –{" "}
                {formatPrice(Math.max(plan.body_lower, plan.body_upper), 5)}
              </p>
            </div>
            <div className="rounded-xl border border-bearish/25 bg-bearish/8 px-3.5 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-bearish">
                {plan.labels.risk || "Risk"} (red)
              </p>
              <p className="mt-1 font-mono text-sm text-bearish">
                {formatPrice(Math.min(plan.risk_lower, plan.risk_upper), 5)} –{" "}
                {formatPrice(Math.max(plan.risk_lower, plan.risk_upper), 5)}
              </p>
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-300">{plan.explanation}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
            <span>ATR(14): <span className="font-mono text-slate-300">{formatPrice(plan.atr, 5)}</span></span>
            <span>Candles ahead: <span className="font-mono text-slate-300">{plan.future_candles}</span></span>
            <span>Horizon: <span className="text-slate-300">{new Date(plan.future_ts).toLocaleString()}</span></span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {plan.notes.map((nte, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                {nte}
              </li>
            ))}
          </ul>
        </>
      )}

      {demand && (
        <div className="mt-4 rounded-xl border border-sky-500/25 bg-sky-500/8 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2">
            <Badge tone="info">{demand.role === "demand" ? "Demand zone" : "Supply zone"}</Badge>
            <span className="font-mono text-sm text-sky-300">
              {formatPrice(demand.lower, 5)} – {formatPrice(demand.upper, 5)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{demand.explanation}</p>
        </div>
      )}
    </Card>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear";
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-sm font-semibold",
          tone === "bull" ? "text-bullish" : tone === "bear" ? "text-bearish" : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ScreenshotPanel({ result }: { result: ChartMindResult }) {
  const shot = result.screenshot;
  if (!shot) return null;
  const meta = DIR_META[shot.direction];
  const Icon = meta.icon;
  const readSomething =
    shot.is_real ||
    shot.instrument ||
    shot.timeframe ||
    shot.current_price != null ||
    shot.levels.length > 0;
  return (
    <Card className="border-sky-500/20">
      <CardHeader
        title="How ChartMind read your screenshot"
        subtitle="Step-by-step reading of the uploaded image — kept separate from the measured OHLC data"
        icon={<ImageIcon className="h-5 w-5" />}
        action={
          <Badge tone={shot.is_real ? "info" : "muted"}>
            {shot.is_real ? "VISION MODEL" : "NO VISION MODEL"}
          </Badge>
        }
      />

      <div
        className={cn(
          "flex items-center gap-3 rounded-xl p-3 ring-1",
          shot.direction === "BULLISH"
            ? "bg-bullish/10 ring-bullish/25"
            : shot.direction === "BEARISH"
              ? "bg-bearish/10 ring-bearish/25"
              : "bg-white/5 ring-white/10"
        )}
      >
        <Icon
          className={cn(
            "h-6 w-6",
            shot.direction === "BULLISH" ? "text-bullish" : shot.direction === "BEARISH" ? "text-bearish" : "text-neutral"
          )}
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{shot.label}</p>
          <p className="text-[11px] text-slate-400">{meta.label}</p>
        </div>
        {shot.used_for_plan && (
          <Badge tone="info">
            <Target className="mr-1 h-3 w-3" />
            Drove the overlay
          </Badge>
        )}
      </div>

      {(shot.instrument || shot.timeframe || shot.trend || shot.current_price != null) && (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ReadFact label="Instrument" value={shot.instrument ?? "—"} />
          <ReadFact label="Timeframe" value={shot.timeframe ?? "—"} />
          <ReadFact label="Trend" value={shot.trend ?? "—"} />
          <ReadFact
            label="Current price"
            value={shot.current_price != null ? formatPrice(shot.current_price, 5) : "—"}
          />
        </div>
      )}

      {shot.structure && (
        <p className="mt-3 text-sm leading-relaxed text-slate-300">{shot.structure}</p>
      )}

      <p className="mt-3 text-sm leading-relaxed text-slate-300">{shot.explanation}</p>

      {shot.reasoning_steps.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <ListChecks className="h-3.5 w-3.5" />
            Reasoning steps taken
          </p>
          <ol className="space-y-1.5">
            {shot.reasoning_steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-300">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-500/15 font-mono text-[10px] text-sky-300">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {shot.levels.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <Layers className="h-3.5 w-3.5" />
            Levels read from the image
          </p>
          <div className="space-y-1.5">
            {shot.levels.map((lvl, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
                <Badge tone={lvl.kind === "support" ? "bull" : "bear"}>
                  {lvl.kind === "support" ? "Support" : "Resistance"}
                </Badge>
                <span className="font-mono text-xs text-slate-200">{formatPrice(lvl.price, 5)}</span>
                {lvl.note && <span className="text-[11px] text-slate-500">{lvl.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {shot.patterns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {shot.patterns.map((p, i) => (
            <Badge key={i} tone="neutral">{p}</Badge>
          ))}
        </div>
      )}

      {shot.challenges.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <ShieldAlert className="h-3.5 w-3.5" />
            Challenges / uncertainties
          </p>
          <ul className="space-y-1.5">
            {shot.challenges.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-amber-200/90">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400/60" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!readSomething && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-neutral/25 bg-neutral/8 px-3 py-2.5 text-[11px] text-amber-200">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {shot.visible_levels_note}
        </div>
      )}

      {(shot.instrument_hint || shot.timeframe_hint) && (
        <p className="mt-3 text-[11px] text-slate-500">
          You labelled it: {shot.instrument_hint || "—"} · {shot.timeframe_hint || "—"}
        </p>
      )}

      {shot.warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {shot.warnings.map((w, i) => (
            <p key={i} className="rounded-lg border border-neutral/25 bg-neutral/8 px-3 py-2 text-[11px] text-amber-200">
              {w}
            </p>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-500">Screenshot engine: {shot.model_name}</p>
    </Card>
  );
}

function ReadFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-navy-900/50 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-mono text-xs text-slate-200" title={value}>{value}</p>
    </div>
  );
}

function PipelinePanel({ result }: { result: ChartMindResult }) {
  const [open, setOpen] = useState(false);
  const steps = useMemo(() => result.pipeline, [result.pipeline]);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-sm font-semibold text-white"
      >
        <ListChecks className="h-4 w-4 text-slate-400" />
        Analysis pipeline
        <ChevronDown className={cn("ml-auto h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {steps.map((s) => (
            <div key={s.key} className="flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2">
              <BadgeCheck className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", s.ok ? "text-bullish" : "text-neutral")} />
              <div>
                <p className="text-xs font-medium text-slate-200">{s.label}</p>
                <p className="text-[11px] text-slate-500">{s.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
