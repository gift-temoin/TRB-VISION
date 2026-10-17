import { Clock, Database, Gauge, Info, Layers } from "lucide-react";
import type { Prediction } from "../../types";
import { formatDateTime, timeAgo } from "../../lib/utils";
import { DirectionBadge, ModelBadge, StatusBadge } from "../ui/Badge";

export function PredictionCard({ prediction }: { prediction: Prediction }) {
  const p = prediction;
  const unavailable = p.status === "UNAVAILABLE";

  return (
    <div className="card card-hover animate-fade-in p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-base font-semibold text-white">{p.symbol}</h3>
            <span className="text-xs text-slate-500">{p.name}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" /> {p.timeframe}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Horizon {p.horizon}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge status={p.status} />
          {!p.is_real && !unavailable && (
            <span className="text-[10px] font-medium uppercase tracking-wide text-neutral">
              Placeholder model
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-navy-900/50 px-4 py-3">
        {unavailable ? (
          <div>
            <p className="text-sm font-semibold text-slate-400">Unavailable</p>
            <p className="text-[11px] text-slate-500">No valid prediction generated</p>
          </div>
        ) : (
          <>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Predicted direction</p>
              <div className="mt-1.5">
                <DirectionBadge direction={p.direction} />
              </div>
            </div>
            {p.probability !== null ? (
              <div className="text-right">
                <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
                  <Gauge className="h-3 w-3" /> Est. probability
                </p>
                <p className="font-mono text-lg font-semibold text-white">
                  {Math.round(p.probability * 100)}%
                </p>
                {p.probability_label && (
                  <p className="text-[10px] text-slate-500">{p.probability_label}</p>
                )}
              </div>
            ) : (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Est. probability</p>
                <p className="text-xs text-slate-500">Not calibrated</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Evidence</p>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{p.explanation}</p>
        {p.evidence.length > 0 && (
          <ul className="mt-2 space-y-1">
            {p.evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                {e}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <ModelBadge status={p.model_status} />
          <span className="inline-flex items-center gap-1">
            <Database className="h-3 w-3" />
            {p.data_source}
            {p.data_as_of ? ` · ${timeAgo(p.data_as_of)}` : ""}
          </span>
        </div>
        <span className="inline-flex items-center gap-1" title={formatDateTime(p.generated_at)}>
          <Clock className="h-3 w-3" />
          Generated {timeAgo(p.generated_at)}
        </span>
      </div>

      {unavailable && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-neutral/8 px-3 py-2 text-[11px] text-amber-200">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {p.explanation}
        </p>
      )}
    </div>
  );
}
