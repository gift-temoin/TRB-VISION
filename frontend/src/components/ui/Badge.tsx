import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import type { Direction, ModelStatus, SignalStatus } from "../../types";

type Tone = "bull" | "bear" | "neutral" | "info" | "muted" | "danger";

const tones: Record<Tone, string> = {
  bull: "bg-bullish/12 text-bullish border-bullish/25",
  bear: "bg-bearish/12 text-bearish border-bearish/25",
  neutral: "bg-neutral/12 text-neutral border-neutral/25",
  info: "bg-sky-500/12 text-sky-400 border-sky-500/25",
  muted: "bg-white/5 text-slate-400 border-white/10",
  danger: "bg-bearish/12 text-bearish border-bearish/25",
};

export function Badge({
  children,
  tone = "muted",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
        tones[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function DirectionBadge({ direction }: { direction: Direction }) {
  const map: Record<Direction, { tone: Tone; label: string; icon: string }> = {
    BULLISH: { tone: "bull", label: "BULLISH", icon: "▲" },
    BEARISH: { tone: "bear", label: "BEARISH", icon: "▼" },
    NEUTRAL: { tone: "neutral", label: "NEUTRAL", icon: "◆" },
  };
  const m = map[direction];
  return (
    <Badge tone={m.tone}>
      <span aria-hidden>{m.icon}</span>
      {m.label}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: SignalStatus }) {
  const map: Record<SignalStatus, Tone> = {
    CURRENT: "bull",
    EXPIRED: "muted",
    UNAVAILABLE: "neutral",
  };
  return (
    <Badge tone={map[status]} dot>
      {status}
    </Badge>
  );
}

export function ModelBadge({ status }: { status: ModelStatus }) {
  if (status === "OFFLINE") return <Badge tone="danger">MODEL OFFLINE</Badge>;
  if (status === "DEGRADED") return <Badge tone="neutral">MODEL DEGRADED</Badge>;
  if (status === "UNCALIBRATED") return <Badge tone="neutral">UNCALIBRATED</Badge>;
  return <Badge tone="info">MODEL CALIBRATED</Badge>;
}
