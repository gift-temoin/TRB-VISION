import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./Button";

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line px-6 py-14 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-slate-400">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-400">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-bearish/25 bg-bearish/5 px-6 py-12 text-center",
        className
      )}
      role="alert"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bearish/15 text-bearish text-xl">
        !
      </div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-400">{description}</p>}
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-bearish/25 bg-bearish/10 px-3 py-2 text-xs text-bearish">
      {children}
    </p>
  );
}

export function InfoBanner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2.5 text-xs",
        tone === "warn"
          ? "border-neutral/25 bg-neutral/8 text-amber-200"
          : "border-sky-500/20 bg-sky-500/8 text-sky-200"
      )}
    >
      {children}
    </div>
  );
}
