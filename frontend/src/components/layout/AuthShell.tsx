import { Activity, ShieldCheck, TrendingUp, Zap } from "lucide-react";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-navy-950">
      {/* Brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-line bg-navy-900 p-12 lg:flex">
        <div className="grid-bg absolute inset-0" />
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-bullish/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-bullish to-emerald-600">
            <TrendingUp className="h-5 w-5 text-navy-950" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight text-white">Trading Robot Guider</p>
            <p className="text-[11px] uppercase tracking-widest text-slate-500">
              Prediction intelligence
            </p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight text-white">
            Directional market guidance, backed by real data.
          </h2>
          <p className="mt-3 text-sm text-slate-400">
            Verified accounts get access to Forex, Gold, Crypto and Binary Options outlooks with
            clear evidence and honest uncertainty. No price charts, no false promises.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              { icon: Activity, text: "Forex, Gold, Crypto & Binary Options categories" },
              { icon: Zap, text: "Current, expired & unavailable signal states" },
              { icon: ShieldCheck, text: "Admin-verified access with secure sessions" },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-bullish">
                  <Icon className="h-4 w-4" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-600">
          Not financial advice. Predictions are probabilistic and may be wrong.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-bullish to-emerald-600">
              <TrendingUp className="h-5 w-5 text-navy-950" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-bold text-white">Trading Robot Guider</p>
          </div>

          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>

          <div className="mt-7">{children}</div>

          {footer && <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
