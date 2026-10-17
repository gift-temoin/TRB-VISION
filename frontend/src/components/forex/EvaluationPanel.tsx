import { FlaskConical, ShieldAlert, TrendingUp } from "lucide-react";
import type { ForexEvaluation } from "../../types";
import { cn, formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";

function pct(v: number | null): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

function signedPct(v: number | null): string {
  if (v == null) return "—";
  const s = (v * 100).toFixed(1);
  return `${v > 0 ? "+" : ""}${s}%`;
}

export function EvaluationPanel({ data }: { data: ForexEvaluation }) {
  const bestBaseline = data.baselines.reduce<number | null>(
    (acc, b) => (b.accuracy != null && (acc == null || b.accuracy > acc) ? b.accuracy : acc),
    null
  );

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-slate-300">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Historical evaluation</h3>
            <p className="mt-0.5 text-xs text-slate-400">
              Chronological train/test backtest — no future-data leakage
            </p>
          </div>
        </div>
        <Badge tone={data.available ? "info" : "muted"}>{data.available ? "OUT-OF-SAMPLE" : "UNAVAILABLE"}</Badge>
      </div>

      {!data.available ? (
        <p className="rounded-xl border border-neutral/25 bg-neutral/8 px-3 py-3 text-sm text-amber-200">
          {data.reason}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">Strategy: {data.strategy_name}</p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Out-of-sample accuracy"
              value={pct(data.out_of_sample_accuracy)}
              tone={
                bestBaseline != null && (data.out_of_sample_accuracy ?? 0) > bestBaseline ? "good" : "plain"
              }
            />
            <Metric label="Signals issued (coverage)" value={pct(data.coverage)} />
            <Metric
              label="Edge vs best baseline"
              value={signedPct(data.edge_vs_best_baseline)}
              tone={
                data.edge_vs_best_baseline != null && data.edge_vs_best_baseline > 0 ? "good" : "bad"
              }
            />
            <Metric
              label="Test samples"
              value={String(data.test_samples)}
              sub={`of ${data.train_samples + data.test_samples}`}
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Range label="Train period" start={data.train_start} end={data.train_end} count={data.train_samples} />
            <Range label="Test period" start={data.test_start} end={data.test_end} count={data.test_samples} />
          </div>

          <div className="mt-5">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <TrendingUp className="h-3.5 w-3.5" /> Baselines (same test set)
            </p>
            <div className="space-y-2">
              {data.baselines.map((b) => (
                <div key={b.name} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-xs text-slate-300" title={b.description}>
                    {b.name}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-slate-500"
                      style={{ width: `${(b.accuracy ?? 0) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-mono text-xs text-slate-400">
                    {pct(b.accuracy)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Notes title="Assumptions" items={data.assumptions} />
        <Notes title="Uncertainty" items={data.uncertainty} warn />
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-neutral/25 bg-neutral/8 px-3 py-2.5 text-[11px] text-amber-200">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {data.disclaimer}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "good" | "bad";
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-lg font-semibold",
          tone === "good" ? "text-bullish" : tone === "bad" ? "text-bearish" : "text-white"
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Range({
  label,
  start,
  end,
  count,
}: {
  label: string;
  start: string | null;
  end: string | null;
  count: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5 text-xs">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-slate-300">{formatDateTime(start)}</p>
      <p className="text-slate-500">
        → {formatDateTime(end)} · {count} candles
      </p>
    </div>
  );
}

function Notes({ title, items, warn }: { title: string; items: string[]; warn?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className={cn("flex items-start gap-2 text-[11px]", warn ? "text-amber-200/80" : "text-slate-400")}>
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
