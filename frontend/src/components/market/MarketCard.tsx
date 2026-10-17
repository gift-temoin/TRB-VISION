import { Radio, TriangleAlert } from "lucide-react";
import type { MarketQuote } from "../../types";
import { cn, formatPct, formatPrice, timeAgo } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { Sparkline } from "./Sparkline";

export function MarketCard({ quote }: { quote: MarketQuote }) {
  const up = (quote.change_pct ?? 0) > 0;
  const down = (quote.change_pct ?? 0) < 0;
  const tone: "bull" | "bear" | "neutral" = up ? "bull" : down ? "bear" : "neutral";

  if (!quote.available) {
    return (
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-sm font-semibold text-white">{quote.symbol}</p>
            <p className="text-[11px] text-slate-500">No price feed</p>
          </div>
          <Badge tone="muted">Unavailable</Badge>
        </div>
        <div className="mt-4 flex h-[96px] items-center justify-center rounded-xl border border-dashed border-line text-xs text-slate-600">
          Genuine data unavailable
        </div>
      </div>
    );
  }

  return (
    <div className="card card-hover p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-white">{quote.symbol}</p>
          <p className="text-[11px] text-slate-500">
            {quote.source}
            {quote.as_of ? ` · ${timeAgo(quote.as_of)}` : ""}
          </p>
        </div>
        {quote.stale ? (
          <Badge tone="neutral">
            <TriangleAlert className="h-3 w-3" /> Stale
          </Badge>
        ) : (
          <Badge tone="bull" dot>
            <Radio className="h-3 w-3" /> Live
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <p className="font-mono text-xl font-semibold text-white">
          {formatPrice(quote.price)}
        </p>
        <p
          className={cn(
            "font-mono text-sm font-medium",
            up ? "text-bullish" : down ? "text-bearish" : "text-slate-400"
          )}
        >
          {formatPct(quote.change_pct)}
        </p>
      </div>

      <div className="mt-2">
        <Sparkline data={quote.series ?? []} tone={tone} height={44} />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-[11px]">
        <div>
          <p className="text-slate-500">High</p>
          <p className="font-mono text-slate-200">{formatPrice(quote.day_high)}</p>
        </div>
        <div>
          <p className="text-slate-500">Low</p>
          <p className="font-mono text-slate-200">{formatPrice(quote.day_low)}</p>
        </div>
        <div>
          <p className="text-slate-500">Open</p>
          <p className="font-mono text-slate-200">{formatPrice(quote.day_open)}</p>
        </div>
      </div>
    </div>
  );
}
