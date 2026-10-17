import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  stages: string[];
  active: boolean;
  title?: string;
  note?: string;
}

/**
 * Honest progress display: it cycles through the *real* pipeline stage names while
 * the backend request is in flight. There is no fake percentage — just the current
 * step and an indeterminate activity bar. When the request resolves, every stage is
 * marked done. Stage labels never claim "live" data (the provider may be in demo mode).
 */
export function LoadingStages({ stages, active, title = "Running analysis…", note }: Props) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrent(stages.length);
      return;
    }
    setCurrent(0);
    const timer = setInterval(() => {
      setCurrent((i) => Math.min(i + 1, stages.length - 1));
    }, 1100);
    return () => clearInterval(timer);
  }, [active, stages.length]);

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-bullish" />
        <p className="text-sm font-semibold text-white">{title}</p>
      </div>

      <div className="mt-4 space-y-2.5">
        {stages.map((stage, i) => {
          const done = !active || i < current;
          const isCurrent = active && i === current;
          return (
            <div key={stage} className="flex items-center gap-3 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  done
                    ? "border-bullish/40 bg-bullish/15 text-bullish"
                    : isCurrent
                      ? "border-bullish/40 text-bullish"
                      : "border-line text-slate-600"
                )}
              >
                {done ? <Check className="h-3 w-3" /> : isCurrent ? <Loader2 className="h-3 w-3 animate-spin" /> : i + 1}
              </span>
              <span className={cn(done || isCurrent ? "text-slate-200" : "text-slate-500")}>{stage}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={cn(
            "h-full w-1/3 rounded-full bg-bullish/70",
            active && "animate-[pulse_1.2s_ease-in-out_infinite]"
          )}
        />
      </div>

      {note && <p className="mt-3 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
