import { useMemo, useState } from "react";
import type { ForexCandle, ForexStructure, IndicatorSeriesPoint } from "../../types";
import { formatPrice } from "../../lib/utils";

interface Props {
  candles: ForexCandle[];
  series?: IndicatorSeriesPoint[];
  structure?: ForexStructure;
  height?: number;
  label?: string;
}

interface RenderedCandle extends ForexCandle {
  x: number;
  bodyTop: number;
  bodyBottom: number;
  wickTop: number;
  wickBottom: number;
  up: boolean;
  ema20?: number;
  ema50?: number;
  ema20y?: number;
  ema50y?: number;
}

const PAD_L = 8;
const PAD_R = 56; // room for price labels
const PAD_T = 14;
const PAD_B = 22;

export function CandleChart({ candles, series, structure, height = 320, label }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;

  const model = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const lows = candles.map((c) => c.low);
    const highs = candles.map((c) => c.high);
    // include EMA values in the range so overlays stay visible
    if (series) {
      series.forEach((s) => {
        if (s.ema20 != null) {
          lows.push(s.ema20);
          highs.push(s.ema20);
        }
        if (s.ema50 != null) {
          lows.push(s.ema50);
          highs.push(s.ema50);
        }
      });
    }
    const min = Math.min(...lows);
    const max = Math.max(...highs);
    const range = max - min || 1;
    const plotW = width - PAD_L - PAD_R;
    const plotH = height - PAD_T - PAD_B;
    const stepX = plotW / candles.length;

    const offset = series ? Math.max(0, candles.length - series.length) : 0;

    const yFor = (price: number) => PAD_T + (1 - (price - min) / range) * plotH;

    const rendered: RenderedCandle[] = candles.map((c, i) => {
      const x = PAD_L + i * stepX + stepX / 2;
      const up = c.close >= c.open;
      const s = series?.[i - offset];
      const ema20y = s?.ema20 != null ? yFor(s.ema20) : undefined;
      const ema50y = s?.ema50 != null ? yFor(s.ema50) : undefined;
      return {
        ...c,
        x,
        bodyTop: yFor(Math.max(c.open, c.close)),
        bodyBottom: yFor(Math.min(c.open, c.close)),
        wickTop: yFor(c.high),
        wickBottom: yFor(c.low),
        up,
        ema20: s?.ema20 ?? undefined,
        ema50: s?.ema50 ?? undefined,
        ema20y,
        ema50y,
      };
    });

    const ema = (key: "ema20y" | "ema50y") =>
      rendered
        .filter((r) => r[key] != null)
        .map((r, idx) => `${idx === 0 ? "M" : "L"}${r.x.toFixed(1)},${(r[key] as number).toFixed(1)}`)
        .join(" ");

    const gridPrices = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: PAD_T + f * plotH,
      price: max - f * range,
    }));

    return {
      rendered,
      stepX,
      ema20Path: ema("ema20y"),
      ema50Path: ema("ema50y"),
      gridPrices,
      min,
      max,
      yFor,
    };
  }, [candles, series, height]);

  if (!model) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-xs text-slate-600"
        style={{ height }}
      >
        No candle history available.
      </div>
    );
  }

  const bodyW = Math.max(1.5, Math.min(9, model.stepX * 0.62));
  const hovered = hover != null ? model.rendered[hover] : null;
  const priceDigits = (model.max - model.min) > 5 ? 3 : 5;

  return (
    <div className="relative">
      {label && <p className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">{label}</p>}

      <div className="mb-2 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> EMA 20
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> EMA 50
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-bullish" /> Up candle
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-bearish" /> Down candle
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="overflow-visible">
        {model.gridPrices.map((g, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={width - PAD_R} y1={g.y} y2={g.y} stroke="rgba(255,255,255,0.05)" />
            <text x={width - PAD_R + 6} y={g.y + 3} fill="#64748b" fontSize="10" fontFamily="monospace">
              {formatPrice(g.price, priceDigits)}
            </text>
          </g>
        ))}

        {/* Support / resistance */}
        {structure?.nearest_resistance != null && (
          <g>
            <line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={model.yFor(structure.nearest_resistance)}
              y2={model.yFor(structure.nearest_resistance)}
              stroke="#ef4444"
              strokeWidth="1"
              strokeDasharray="5 4"
              opacity="0.5"
            />
            <text x={PAD_L + 2} y={model.yFor(structure.nearest_resistance) - 3} fill="#f87171" fontSize="9">
              resistance {formatPrice(structure.nearest_resistance, priceDigits)}
            </text>
          </g>
        )}
        {structure?.nearest_support != null && (
          <g>
            <line
              x1={PAD_L}
              x2={width - PAD_R}
              y1={model.yFor(structure.nearest_support)}
              y2={model.yFor(structure.nearest_support)}
              stroke="#22c55e"
              strokeWidth="1"
              strokeDasharray="5 4"
              opacity="0.5"
            />
            <text x={PAD_L + 2} y={model.yFor(structure.nearest_support) + 11} fill="#4ade80" fontSize="9">
              support {formatPrice(structure.nearest_support, priceDigits)}
            </text>
          </g>
        )}

        {model.rendered.map((c, i) => (
          <g key={i} opacity={c.complete ? 1 : 0.45}>
            <line
              x1={c.x}
              x2={c.x}
              y1={c.wickTop}
              y2={c.wickBottom}
              stroke={c.up ? "#22c55e" : "#ef4444"}
              strokeWidth="1"
            />
            <rect
              x={c.x - bodyW / 2}
              y={c.bodyTop}
              width={bodyW}
              height={Math.max(1, c.bodyBottom - c.bodyTop)}
              fill={c.up ? "#22c55e" : "#ef4444"}
              rx={0.5}
            />
            <rect
              x={c.x - model.stepX / 2}
              y={PAD_T}
              width={model.stepX}
              height={height - PAD_T - PAD_B}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          </g>
        ))}

        {model.ema20Path && <path d={model.ema20Path} fill="none" stroke="#38bdf8" strokeWidth="1.75" />}
        {model.ema50Path && <path d={model.ema50Path} fill="none" stroke="#f59e0b" strokeWidth="1.75" />}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-line bg-navy-800 px-2.5 py-1.5 text-[11px] shadow-card"
          style={{
            left: `${(hovered.x / width) * 100}%`,
            transform: `translateX(${hovered.x / width > 0.7 ? "-105%" : "8px"})`,
          }}
        >
          <p className="font-mono text-white">
            O {formatPrice(hovered.open, priceDigits)} H {formatPrice(hovered.high, priceDigits)}
          </p>
          <p className="font-mono text-white">
            L {formatPrice(hovered.low, priceDigits)} C {formatPrice(hovered.close, priceDigits)}
          </p>
          <p className="text-slate-400">{new Date(hovered.ts).toLocaleString()}</p>
          {!hovered.complete && <p className="text-neutral">still forming</p>}
        </div>
      )}

      <p className="mt-1 text-center text-[10px] text-slate-600">
        Educational historical candles — not a forecast
      </p>
    </div>
  );
}
