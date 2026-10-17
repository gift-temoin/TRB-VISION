import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";
import type { ForexIndicator, ForexStructure } from "../../types";
import { cn, formatPrice } from "../../lib/utils";
import { Badge } from "../ui/Badge";

function zoneTone(zone: string | null): "bull" | "bear" | "neutral" | "muted" | "info" {
  if (!zone) return "muted";
  const z = zone.toLowerCase();
  if (z.includes("overbought") || z.includes("upward")) return "bull";
  if (z.includes("oversold") || z.includes("downward")) return "bear";
  if (z.includes("trending")) return "info";
  return "neutral";
}

export function IndicatorPanel({
  indicators,
  structure,
}: {
  indicators: ForexIndicator[];
  structure: ForexStructure;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {indicators.map((ind) => (
          <IndicatorCard key={ind.key} indicator={ind} />
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Swing structure
          </p>
          <Badge tone={structure.trend === "UP" ? "bull" : structure.trend === "DOWN" ? "bear" : "neutral"}>
            {structure.trend}
          </Badge>
        </div>
        <p className="mt-2 text-sm text-slate-300">{structure.summary}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <p className="text-slate-500">Nearest resistance</p>
            <p className="font-mono text-sm text-bearish">
              {structure.nearest_resistance != null ? formatPrice(structure.nearest_resistance) : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-white/5 px-3 py-2">
            <p className="text-slate-500">Nearest support</p>
            <p className="font-mono text-sm text-bullish">
              {structure.nearest_support != null ? formatPrice(structure.nearest_support) : "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: ForexIndicator }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{indicator.name}</p>
          <p className="mt-1 font-mono text-lg text-white">
            {indicator.display ?? <span className="text-sm text-slate-500">not ready</span>}
          </p>
        </div>
        {indicator.zone && <Badge tone={zoneTone(indicator.zone)}>{indicator.zone}</Badge>}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 flex w-full items-center gap-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200"
      >
        <Info className="h-3.5 w-3.5" />
        How this is calculated
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
          <p>
            <span className="font-semibold text-slate-300">What: </span>
            {indicator.what}
          </p>
          <p>
            <span className="font-semibold text-slate-300">How: </span>
            {indicator.how}
          </p>
          <p>
            <span className="font-semibold text-slate-300">Contributes: </span>
            {indicator.contributes}
          </p>
        </div>
      )}
    </div>
  );
}
