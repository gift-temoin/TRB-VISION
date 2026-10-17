import { useMemo, useState } from "react";
import { cn, formatPrice } from "../../lib/utils";

interface Point {
  t: string;
  c: number;
}

export function TrendChart({
  data,
  tone = "neutral",
  height = 220,
  label,
}: {
  data: Point[];
  tone?: "bull" | "bear" | "neutral";
  height?: number;
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;

  const model = useMemo(() => {
    if (!data || data.length < 2) return null;
    const values = data.map((d) => d.c);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = 18;
    const stepX = (width - pad * 2) / (data.length - 1);
    const points = data.map((d, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((d.c - min) / range) * (height - pad * 2);
      return { x, y, ...d };
    });
    const line = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(" ");
    const area = `${line} L${points[points.length - 1].x.toFixed(1)},${height - pad} L${points[0].x.toFixed(1)},${height - pad} Z`;
    return { points, line, area, min, max };
  }, [data, height]);

  if (!model) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-slate-600"
        style={{ height }}
      >
        No historical series available for this instrument.
      </div>
    );
  }

  const stroke = tone === "bull" ? "#22c55e" : tone === "bear" ? "#ef4444" : "#64748b";
  const fill = tone === "bull" ? "rgba(34,197,94,0.16)" : tone === "bear" ? "rgba(239,68,68,0.16)" : "rgba(100,116,139,0.14)";

  return (
    <div className="relative">
      {label && (
        <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="overflow-visible">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor={fill} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={18}
            x2={width - 18}
            y1={18 + f * (height - 36)}
            y2={18 + f * (height - 36)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        <path d={model.area} fill="url(#trend-fill)" />
        <path d={model.line} fill="none" stroke={stroke} strokeWidth="2.25" strokeLinejoin="round" />

        {model.points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hover === i ? 4.5 : 2.5}
              fill={hover === i ? stroke : "transparent"}
              stroke={stroke}
              strokeWidth={hover === i ? 2 : 1}
              opacity={hover === i ? 1 : 0.5}
            />
            <rect
              x={p.x - (width - 36) / (data.length - 1) / 2}
              y={0}
              width={(width - 36) / (data.length - 1)}
              height={height}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 rounded-lg border border-line bg-navy-800 px-2.5 py-1.5 text-[11px] shadow-card"
          style={{
            left: `${(model.points[hover].x / width) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <p className="font-mono text-white">{formatPrice(model.points[hover].c)}</p>
          <p className="text-slate-400">
            {new Date(model.points[hover].t).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
      )}

      <div className="mt-1 flex justify-between px-1 text-[10px] text-slate-600">
        <span>
          {data[0]?.t
            ? new Date(data[0].t).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            : ""}
        </span>
        <span className="text-slate-500">Educational historical trend — not a forecast</span>
        <span>
          {data[data.length - 1]?.t
            ? new Date(data[data.length - 1].t).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : ""}
        </span>
      </div>
    </div>
  );
}

export function TrendLegend({ tone, className }: { tone: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[11px]", className)}>
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: tone === "bull" ? "#22c55e" : tone === "bear" ? "#ef4444" : "#64748b" }}
      />
      {tone === "bull" ? "Upward bias" : tone === "bear" ? "Downward bias" : "Sideways"}
    </span>
  );
}
