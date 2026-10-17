import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChartLevel,
  DemandZone,
  ForexCandle,
  FutureMarker,
  IndicatorSeriesPoint,
  PriceZone,
  SwingPoint,
  TradePlan,
} from "../../types";
import { formatPrice } from "../../lib/utils";

interface Props {
  candles: ForexCandle[];
  series?: IndicatorSeriesPoint[];
  levels?: ChartLevel[];
  zones?: PriceZone[];
  swings?: SwingPoint[];
  futureMarker?: FutureMarker | null;
  tradePlan?: TradePlan | null;
  demandZone?: DemandZone | null;
  height?: number;
  label?: string;
  showLevels?: boolean;
  showZones?: boolean;
  showSwings?: boolean;
  showTradePlan?: boolean;
  showDemand?: boolean;
}

const PAD_L = 8;
const PAD_R = 64;
const PAD_T = 16;
const PAD_B = 28;
const WIDTH = 880;

const C = {
  bull: "#22c55e",
  bear: "#ef4444",
  ema20: "#38bdf8",
  ema50: "#f59e0b",
  demand: "#22d3ee",
  body: "#94a3b8",
  boundary: "#e2e8f0",
  future: "#a78bfa",
};

interface View {
  start: number;
  count: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Candlestick chart that renders every overlay through one price->y / index->x transform.
 * Geometries are defined in price/time coordinates (never screen pixels), so risk/reward
 * rectangles, zones and levels stay locked to the data through zoom, pan and new candles.
 */
export function ChartMindChart({
  candles,
  series,
  levels = [],
  zones = [],
  swings = [],
  futureMarker,
  tradePlan,
  demandZone,
  height = 380,
  label,
  showLevels = true,
  showZones = true,
  showSwings = true,
  showTradePlan = true,
  showDemand = true,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ start: 0, count: 60 });
  const [hover, setHover] = useState<number | null>(null);
  const dragRef = useRef<{ x: number; view: View } | null>(null);

  const n = candles.length;
  const futureSlots = useMemo(() => {
    if (tradePlan?.future_candles) return tradePlan.future_candles;
    if (futureMarker?.candles_ahead) return futureMarker.candles_ahead;
    return 0;
  }, [tradePlan, futureMarker]);
  const totalSlots = Math.max(n + futureSlots, 1);

  const defaultView = useCallback((): View => {
    const visibleBars = Math.min(n, 110);
    const count = Math.max(visibleBars + futureSlots, 30);
    const start = Math.max(0, n - visibleBars);
    return { start, count };
  }, [n, futureSlots]);

  // Reset the viewport whenever new data arrives (new candles / horizon).
  useEffect(() => {
    setView(defaultView());
  }, [defaultView]);

  const clampView = useCallback(
    (v: View): View => {
      const count = clamp(v.count, 20, totalSlots + 40);
      const start = clamp(v.start, -count * 0.5, totalSlots - count * 0.5);
      return { start, count };
    },
    [totalSlots]
  );

  const zoomBy = useCallback(
    (factor: number, clientX: number | null) => {
      const el = svgRef.current;
      setView((v) => {
        const count = clamp(v.count * factor, 20, totalSlots + 40);
        let start: number;
        if (clientX != null && el) {
          const rect = el.getBoundingClientRect();
          const mx = ((clientX - rect.left) / rect.width) * WIDTH;
          const frac = clamp((mx - PAD_L) / (WIDTH - PAD_L - PAD_R), 0, 1);
          const idx = v.start + frac * v.count;
          start = idx - frac * count;
        } else {
          start = v.start + (v.count - count) / 2;
        }
        return clampView({ start, count });
      });
    },
    [totalSlots, clampView]
  );

  // Native wheel listener (passive:false) so we can prevent page scroll while zooming.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 1.12 : 0.89, e.clientX);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const toViewBoxX = (clientX: number): number => {
    const el = svgRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * WIDTH;
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = { x: e.clientX, view };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = toViewBoxX(e.clientX) - toViewBoxX(dragRef.current.x);
    const pxPerIndex = (WIDTH - PAD_L - PAD_R) / dragRef.current.view.count;
    setView(clampView({ start: dragRef.current.view.start - dx / pxPerIndex, count: dragRef.current.view.count }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  const model = useMemo(() => {
    if (!candles || candles.length < 2) return null;

    const plotW = WIDTH - PAD_L - PAD_R;
    const plotH = height - PAD_T - PAD_B;
    const xForIdx = (i: number) => PAD_L + ((i - view.start) / view.count) * plotW;

    const seriesByTs = new Map<string, IndicatorSeriesPoint>();
    (series ?? []).forEach((s) => seriesByTs.set(s.ts, s));

    const lo = Math.max(0, Math.floor(view.start));
    const hi = Math.min(n - 1, Math.ceil(view.start + view.count));
    const lows: number[] = [];
    const highs: number[] = [];
    for (let i = lo; i <= hi; i++) {
      lows.push(candles[i].low);
      highs.push(candles[i].high);
      const s = seriesByTs.get(candles[i].ts);
      if (s?.ema20 != null) {
        lows.push(s.ema20);
        highs.push(s.ema20);
      }
      if (s?.ema50 != null) {
        lows.push(s.ema50);
        highs.push(s.ema50);
      }
    }
    if (showTradePlan && tradePlan?.available) {
      [tradePlan.body_lower, tradePlan.body_upper, tradePlan.risk_lower, tradePlan.risk_upper].forEach((p) => {
        lows.push(p);
        highs.push(p);
      });
    }
    if (showDemand && demandZone) {
      lows.push(demandZone.lower, demandZone.upper);
      highs.push(demandZone.lower, demandZone.upper);
    }
    if (showLevels) {
      levels.forEach((l) => {
        highs.push(l.upper ?? l.price);
        lows.push(l.lower ?? l.price);
      });
    }

    if (!highs.length || !lows.length) return null;

    let min = Math.min(...lows);
    let max = Math.max(...highs);
    const pad = (max - min || Math.abs(max) || 1) * 0.06;
    min -= pad;
    max += pad;
    const range = max - min || 1;
    const yFor = (price: number) => PAD_T + (1 - (price - min) / range) * plotH;

    const rendered = candles.map((c) => ({ c }));
    const indexByTs = new Map<string, number>();
    candles.forEach((c, i) => indexByTs.set(c.ts, i));

    const linePath = (key: "ema20" | "ema50") => {
      const pts: string[] = [];
      for (let i = lo; i <= hi; i++) {
        const s = seriesByTs.get(candles[i].ts);
        const val = s ? s[key] : null;
        if (val == null) continue;
        pts.push(`${pts.length === 0 ? "M" : "L"}${xForIdx(i).toFixed(1)},${yFor(val).toFixed(1)}`);
      }
      return pts.join(" ");
    };

    const gridPrices = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PAD_T + f * plotH, price: max - f * range }));

    const barStep = plotW / view.count;
    return {
      xForIdx,
      yFor,
      plotW,
      plotH,
      min,
      max,
      range,
      rendered,
      indexByTs,
      seriesByTs,
      ema20Path: linePath("ema20"),
      ema50Path: linePath("ema50"),
      gridPrices,
      barStep,
      lo,
      hi,
    };
  }, [candles, series, levels, view, height, tradePlan, demandZone, showTradePlan, showDemand, showLevels, n]);

  if (!model || n < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-slate-600"
        style={{ height }}
      >
        Not enough candle history to draw a chart.
      </div>
    );
  }

  const { xForIdx, yFor, plotW, plotH, rendered, indexByTs, seriesByTs } = model;
  const bodyW = clamp(model.barStep * 0.62, 1.5, 9);
  const hovered = hover != null ? rendered[hover]?.c : null;
  const priceDigits = model.max - model.min > 5 ? 3 : 5;
  const xRight = WIDTH - PAD_R;

  const entryIdx = n - 1;
  const futureEndIdx = n - 1 + futureSlots;
  const overlayX0 = xForIdx(entryIdx - Math.min(6, entryIdx));
  const overlayX1 = futureSlots > 0 ? xForIdx(futureEndIdx) : xRight;

  const plan = showTradePlan && tradePlan?.available ? tradePlan : null;
  const demand = showDemand && demandZone ? demandZone : null;

  // De-overlap level labels.
  const labelRows: number[] = [];
  const levelLabels = (showLevels ? levels : []).map((l) => {
    const y = yFor(l.price);
    let ly = y;
    while (labelRows.some((r) => Math.abs(r - ly) < 11)) ly += 11;
    labelRows.push(ly);
    return { l, y, ly };
  });

  const rectY = (a: number, b: number) => {
    const ya = yFor(a);
    const yb = yFor(b);
    return { top: Math.min(ya, yb), h: Math.max(1, Math.abs(yb - ya)) };
  };

  return (
    <div className="relative">
      {label && <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>}

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        <Legend color={C.ema20} label="EMA 20" />
        <Legend color={C.ema50} label="EMA 50" />
        {showSwings && <Legend color="#a78bfa" label="Swing" />}
        {demand && <Legend color={C.demand} square label={`${demand.role === "demand" ? "Demand" : "Supply"} zone`} />}
        {plan && <Legend color={C.body} square label={plan.labels.body || "Projection"} />}
        {plan && <Legend color={C.bear} square label={plan.labels.risk || "Risk"} />}
        <span className="ml-auto inline-flex items-center gap-1 text-slate-600">
          scroll to zoom · drag to pan
        </span>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-16 top-6 z-10 flex flex-col gap-1">
        <ChartButton title="Zoom in" onClick={() => zoomBy(0.85, null)}>
          <ZoomIn className="h-3.5 w-3.5" />
        </ChartButton>
        <ChartButton title="Zoom out" onClick={() => zoomBy(1.18, null)}>
          <ZoomOut className="h-3.5 w-3.5" />
        </ChartButton>
        <ChartButton title="Reset view" onClick={() => setView(defaultView())}>
          <Maximize2 className="h-3.5 w-3.5" />
        </ChartButton>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        width="100%"
        height={height}
        className="cursor-grab touch-none overflow-visible active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          dragRef.current = null;
          setHover(null);
        }}
      >
        {/* Demand/supply zone — spans the full chart width, in price coordinates */}
        {demand && (
          <g>
            <rect
              x={PAD_L}
              y={rectY(demand.upper, demand.lower).top}
              width={plotW}
              height={rectY(demand.upper, demand.lower).h}
              fill={C.demand}
              opacity={0.16}
              stroke={C.demand}
              strokeOpacity={0.45}
              strokeDasharray="2 3"
            />
            <Tag
              x={PAD_L + 4}
              y={yFor((demand.upper + demand.lower) / 2) + 3}
              text={`${demand.role === "demand" ? "DEMAND" : "SUPPLY"} ${formatPrice(demand.lower, priceDigits)}–${formatPrice(demand.upper, priceDigits)}`}
              color={C.demand}
            />
          </g>
        )}

        {/* Background support/resistance zone fills */}
        {showZones &&
          zones.map((z, i) => {
            const r = rectY(z.upper, z.lower);
            return (
              <rect
                key={`z${i}`}
                x={PAD_L}
                y={r.top}
                width={plotW}
                height={r.h}
                fill={z.kind === "support" ? C.bull : C.bear}
                opacity={0.08}
              />
            );
          })}

        {/* Price grid */}
        {model.gridPrices.map((g, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={xRight} y1={g.y} y2={g.y} stroke="rgba(255,255,255,0.05)" />
            <text x={xRight + 6} y={g.y + 3} fill="#64748b" fontSize="10" fontFamily="monospace">
              {formatPrice(g.price, priceDigits)}
            </text>
          </g>
        ))}

        {/* Risk/reward overlay — rectangles in price coords, x in time coords */}
        {plan && (
          <g>
            {/* Grey projection body */}
            <rect
              x={overlayX0}
              y={rectY(plan.body_upper, plan.body_lower).top}
              width={Math.max(2, overlayX1 - overlayX0)}
              height={rectY(plan.body_upper, plan.body_lower).h}
              fill={C.body}
              opacity={0.2}
              stroke={C.body}
              strokeOpacity={0.7}
              strokeDasharray="4 3"
            />
            {/* Red risk zone (above or below the grey, depending on bias) */}
            <rect
              x={overlayX0}
              y={rectY(plan.risk_upper, plan.risk_lower).top}
              width={Math.max(2, overlayX1 - overlayX0)}
              height={rectY(plan.risk_upper, plan.risk_lower).h}
              fill={C.bear}
              opacity={0.2}
              stroke={C.bear}
              strokeOpacity={0.75}
            />
            {/* Boundary line separating the zones (the entry/reference price) */}
            <line
              x1={overlayX0}
              x2={overlayX1}
              y1={yFor(plan.boundary)}
              y2={yFor(plan.boundary)}
              stroke={C.boundary}
              strokeWidth={1.8}
            />
            {/* Zone labels */}
            <Tag
              x={(overlayX0 + overlayX1) / 2}
              y={yFor((plan.body_upper + plan.body_lower) / 2) + 3}
              text={`${plan.labels.body || "Projection"} · ${formatPrice(Math.min(plan.body_lower, plan.body_upper), priceDigits)}–${formatPrice(Math.max(plan.body_lower, plan.body_upper), priceDigits)}`}
              color={C.body}
              anchor="middle"
            />
            <Tag
              x={(overlayX0 + overlayX1) / 2}
              y={yFor((plan.risk_upper + plan.risk_lower) / 2) + 3}
              text={`${plan.labels.risk || "Risk"} · ${formatPrice(Math.min(plan.risk_lower, plan.risk_upper), priceDigits)}–${formatPrice(Math.max(plan.risk_lower, plan.risk_upper), priceDigits)}`}
              color="#fca5a5"
              anchor="middle"
            />
            <Tag
              x={overlayX0 + 2}
              y={yFor(plan.boundary) - 5}
              text={`${plan.labels.boundary || "Entry"} ${formatPrice(plan.boundary, priceDigits)}${plan.reward_risk ? ` · R:R ${plan.reward_risk}` : ""}`}
              color="#f1f5f9"
            />
          </g>
        )}

        {/* Level lines */}
        {levelLabels.map(({ l, y, ly }, i) => {
          const color = l.kind === "support" ? C.bull : C.bear;
          return (
            <g key={`l${i}`}>
              <line x1={PAD_L} x2={xRight} y1={y} y2={y} stroke={color} strokeWidth="1" strokeDasharray="5 4" opacity="0.55" />
              <text x={PAD_L + 2} y={ly - 2} fill={color} fontSize="9">
                {l.kind === "support" ? "S" : "R"} {formatPrice(l.price, priceDigits)} · {l.strength}
              </text>
            </g>
          );
        })}

        {/* Candles */}
        {rendered.map(({ c }, i) => {
          if (i < model.lo || i > model.hi) return null;
          const x = xForIdx(i);
          const up = c.close >= c.open;
          const bodyTop = yFor(Math.max(c.open, c.close));
          const bodyBottom = yFor(Math.min(c.open, c.close));
          return (
            <g key={i} opacity={c.complete ? 1 : 0.45}>
              <line x1={x} x2={x} y1={yFor(c.high)} y2={yFor(c.low)} stroke={up ? C.bull : C.bear} strokeWidth="1" />
              <rect x={x - bodyW / 2} y={bodyTop} width={bodyW} height={Math.max(1, bodyBottom - bodyTop)} fill={up ? C.bull : C.bear} rx={0.5} />
              <rect
                x={x - model.barStep / 2}
                y={PAD_T}
                width={model.barStep}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}

        {/* Swing markers */}
        {showSwings &&
          swings.map((s, i) => {
            const idx = indexByTs.get(s.ts);
            if (idx == null || idx < model.lo || idx > model.hi) return null;
            const x = xForIdx(idx);
            const high = s.kind === "HIGH";
            const y = yFor(s.price) + (high ? -7 : 7);
            const color = high ? "#f87171" : "#4ade80";
            return (
              <polygon
                key={`s${i}`}
                points={high ? `${x},${y + 5} ${x - 3.4},${y} ${x + 3.4},${y}` : `${x},${y - 5} ${x - 3.4},${y} ${x + 3.4},${y}`}
                fill={color}
                opacity="0.9"
              />
            );
          })}

        {/* EMA overlays */}
        {model.ema20Path && <path d={model.ema20Path} fill="none" stroke={C.ema20} strokeWidth="1.6" />}
        {model.ema50Path && <path d={model.ema50Path} fill="none" stroke={C.ema50} strokeWidth="1.6" />}

        {/* Future marker */}
        {futureMarker && futureSlots > 0 && (
          <g>
            <line x1={overlayX1} x2={overlayX1} y1={PAD_T} y2={height - PAD_B} stroke={C.future} strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={overlayX1 - 4} y={PAD_T + 10} fill={C.future} fontSize="9" textAnchor="end">
              future +{futureSlots}
            </text>
          </g>
        )}

        {/* Time axis ticks */}
        {[0, 1, 2, 3].map((k) => {
          const idx = Math.round(model.lo + ((model.hi - model.lo) * k) / 3);
          const c = candles[idx];
          if (!c) return null;
          return (
            <text key={k} x={xForIdx(idx)} y={height - 8} fill="#64748b" fontSize="9" textAnchor={k === 0 ? "start" : k === 3 ? "end" : "middle"}>
              {new Date(c.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-line bg-navy-800 px-2.5 py-1.5 text-[11px] shadow-card"
          style={{
            left: `${(xForIdx(indexByTs.get(hovered.ts) ?? 0) / WIDTH) * 100}%`,
            transform: "translateX(8px)",
          }}
        >
          <p className="font-mono text-white">
            O {formatPrice(hovered.open, priceDigits)} H {formatPrice(hovered.high, priceDigits)}
          </p>
          <p className="font-mono text-white">
            L {formatPrice(hovered.low, priceDigits)} C {formatPrice(hovered.close, priceDigits)}
          </p>
          <p className="text-slate-400">{new Date(hovered.ts).toLocaleString()}</p>
          {(() => {
            const s = seriesByTs.get(hovered.ts);
            if (!s) return null;
            return (
              <p className="text-slate-500">
                {s.ema20 != null && `EMA20 ${formatPrice(s.ema20, priceDigits)} `}
                {s.rsi14 != null && `RSI ${s.rsi14.toFixed(1)}`}
              </p>
            );
          })()}
          {!hovered.complete && <p className="text-neutral">still forming</p>}
        </div>
      )}

      <p className="mt-1 text-center text-[10px] text-slate-600">
        All overlays are positioned in real price &amp; time coordinates · levels are swing-derivable areas, not exact prices
      </p>
    </div>
  );
}

function ChartButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-navy-900/80 text-slate-300 backdrop-blur transition-colors hover:bg-navy-700 hover:text-white"
    >
      {children}
    </button>
  );
}

function Tag({
  x,
  y,
  text,
  color,
  anchor = "start",
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  anchor?: "start" | "middle" | "end";
}) {
  const w = text.length * 5.4 + 10;
  const rx = anchor === "end" ? x - w : anchor === "middle" ? x - w / 2 : x;
  return (
    <g pointerEvents="none">
      <rect x={rx} y={y - 10} width={w} height={14} rx={3} fill="rgba(2,6,23,0.78)" stroke={color} strokeOpacity={0.5} />
      <text x={rx + 5} y={y} fill={color} fontSize="9.5" fontFamily="ui-monospace, monospace">
        {text}
      </text>
    </g>
  );
}

function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={square ? "h-2 w-2 rounded-sm" : "h-2 w-2 rounded-full"} style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
