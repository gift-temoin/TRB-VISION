import { History, Image as ImageIcon, Trash2 } from "lucide-react";
import type { ChartMindHistoryItem } from "../../types";
import { Badge } from "../ui/Badge";
import { cn, formatDateTime } from "../../lib/utils";
import { Card, CardHeader } from "../ui/Card";
import { EmptyState } from "../ui/States";

interface Props {
  items: ChartMindHistoryItem[];
  loading: boolean;
  activeId: number | null;
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
}

export function AnalysisHistory({ items, loading, activeId, onOpen, onDelete }: Props) {
  return (
    <Card>
      <CardHeader
        title="Saved analyses"
        subtitle="Private to your account"
        icon={<History className="h-5 w-5" />}
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/5" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Run an analysis and choose Save to keep it here for later review."
          icon={<History className="h-5 w-5" />}
        />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const active = item.id === activeId;
            return (
              <li key={item.id}>
                <div
                  className={cn(
                    "group flex items-start gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                    active
                      ? "border-bullish/30 bg-bullish/8"
                      : "border-line bg-navy-900/40 hover:border-line hover:bg-white/5"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white" title={item.title}>
                        {item.title}
                      </span>
                      {!item.is_real && <Badge tone="muted">sample</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {item.symbol} · {item.interval} · {item.candles_analyzed} candles
                      {item.has_screenshot && (
                        <ImageIcon className="ml-1 inline h-3 w-3 align-text-bottom text-sky-400" />
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-600">{formatDateTime(item.created_at)}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    className="rounded-lg p-1.5 text-slate-500 opacity-0 transition-opacity hover:bg-bearish/10 hover:text-bearish group-hover:opacity-100"
                    aria-label={`Delete ${item.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
