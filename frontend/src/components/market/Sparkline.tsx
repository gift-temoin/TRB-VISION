import { useMemo } from "react";
import { cn } from "../../lib/utils";

interface Point {
  t: string;
  c: number;
}

export function Sparkline({
  data,
  tone = "neutral",
  className,
  height = 40,
  width = 120,
}: {
  data: Point[];
  tone?: "bull" | "bear" | "neutral";
  className?: string;
  height?: number;
  width?: number;
}) {
  const path = useMemo(() => {
    if (!data || data.length < 2) return null;
    const values = data.map((d) => d.c);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const points = data.map((d, i) => {
      const x = i * stepX;
      const y = height - ((d.c - min) / range) * (height - 6) - 3;
      return [x, y] as const;
    });
    const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [data, height, width]);

  if (!path) {
    return (
      <div
        className={cn("flex items-center justify-center text-[10px] text-slate-600", className)}
        style={{ height }}
      >
        no series
      </div>
    );
  }

  const stroke = tone === "bull" ? "#22c55e" : tone === "bear" ? "#ef4444" : "#64748b";
  const fill = tone === "bull" ? "rgba(34,197,94,0.12)" : tone === "bear" ? "rgba(239,68,68,0.12)" : "rgba(100,116,139,0.1)";
  const gid = `spark-${tone}-${data.length}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity="1" />
          <stop offset="100%" stopColor={fill} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill={`url(#${gid})`} />
      <path d={path.line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
