import { AlertTriangle, Database, Radio, ShieldCheck, WifiOff } from "lucide-react";
import type { CandleWarning, DataSourceStatus as Status } from "../../types";
import { Badge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { formatDateTime, timeAgo } from "../../lib/utils";

export function DataSourceStatus({
  status,
  warnings,
}: {
  status: Status;
  warnings: CandleWarning[];
}) {
  const tone = status.is_live ? "bull" : status.is_sample ? "neutral" : "muted";
  const label = status.is_live ? "LIVE" : status.is_sample ? "SAMPLE" : "UNAVAILABLE";

  return (
    <Card>
      <CardHeader
        title="Data source"
        subtitle={`${status.symbol} · ${status.interval}`}
        icon={<Database className="h-5 w-5" />}
        action={
          <Badge tone={tone} dot>
            {status.is_live ? <Radio className="h-3 w-3" /> : status.is_sample ? <ShieldCheck className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {label}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Meta label="Provider" value={status.provider} />
        <Meta label="Candles" value={String(status.candles)} sub={`${status.completed_candles} completed`} />
        <Meta
          label="Latest candle"
          value={status.latest_candle ? timeAgo(status.latest_candle) : "—"}
          sub={formatDateTime(status.latest_candle)}
        />
        <Meta
          label="Latest completed"
          value={status.latest_complete_candle ? timeAgo(status.latest_complete_candle) : "—"}
          sub={formatDateTime(status.latest_complete_candle)}
        />
      </div>

      {status.message && (
        <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400">
          {status.message}
        </p>
      )}

      {warnings.length > 0 && (
        <div className="mt-3 space-y-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-neutral/25 bg-neutral/8 px-3 py-2 text-[11px] text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Meta({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-white" title={value}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}
