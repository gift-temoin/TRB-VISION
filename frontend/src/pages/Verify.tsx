import {
  Check,
  Clock,
  Lock,
  MessageCircle,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { InlineError } from "../components/ui/States";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";

type StepState = "done" | "active" | "idle" | "rejected";

function StepNode({
  state,
  label,
  icon,
}: {
  state: StepState;
  label: string;
  icon: "done" | "clock" | "lock" | "x";
}) {
  const ring: Record<StepState, string> = {
    done: "border-bullish/60 bg-bullish/15 text-bullish",
    active: "border-neutral/60 bg-neutral/15 text-neutral",
    idle: "border-white/10 bg-white/5 text-slate-500",
    rejected: "border-bearish/60 bg-bearish/15 text-bearish",
  };
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span
        className={cn(
          "relative flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
          ring[state]
        )}
      >
        {state === "active" && (
          <span className="absolute inset-0 animate-ping rounded-full bg-neutral/30" />
        )}
        {icon === "done" && <Check className="relative h-4 w-4" />}
        {icon === "clock" && <Clock className="relative h-4 w-4" />}
        {icon === "lock" && <Lock className="relative h-4 w-4" />}
        {icon === "x" && <X className="relative h-4 w-4" />}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium uppercase tracking-wide",
          state === "idle" ? "text-slate-600" : "text-slate-300"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function Stepper({ rejected }: { rejected: boolean }) {
  return (
    <div className="flex items-start">
      <StepNode state="done" icon="done" label="Created" />
      <span
        className={cn(
          "mt-4 h-px flex-1",
          rejected ? "bg-bearish/40" : "bg-neutral/40"
        )}
      />
      <StepNode
        state={rejected ? "rejected" : "active"}
        icon={rejected ? "x" : "clock"}
        label={rejected ? "Deactivated" : "In review"}
      />
      <span className="mt-4 h-px flex-1 bg-white/10" />
      <StepNode state="idle" icon="lock" label="Access" />
    </div>
  );
}

export function Verify() {
  const { user, refresh, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        await refresh();
      } catch {
        if (!cancelled) setError("Unable to verify your account status. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void check();
    const interval = setInterval(() => void check(), 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refresh]);

  useEffect(() => {
    if (user?.is_verified && user?.is_active) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-navy-950">
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-bullish/20 to-emerald-600/20">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-bullish/30 to-emerald-600/30 blur-xl animate-pulse" />
            <Shield className="relative h-8 w-8 text-bullish" />
          </div>
          <p className="text-sm text-slate-400">Checking your account status…</p>
        </div>
      </div>
    );
  }

  const isRejected = user && !user.is_active;

  const handleContactAdmin = () => {
    window.dispatchEvent(new CustomEvent("trb:open-chat"));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="relative flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-navy-950 px-4 py-10">
      {/* Ambient gradient background */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-32 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-bullish/10 blur-[120px]" />
        <div className="absolute bottom-[-140px] left-[-120px] h-[380px] w-[380px] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute right-[-120px] top-1/3 h-[380px] w-[380px] rounded-full bg-emerald-600/10 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
            maskImage: "radial-gradient(circle at 50% 40%, black, transparent 72%)",
            WebkitMaskImage: "radial-gradient(circle at 50% 40%, black, transparent 72%)",
          }}
        />
      </div>

      <div className="relative w-full max-w-[460px] animate-fade-in">
        {/* Illustration */}
        <div className="mb-7 flex justify-center">
          <div className="relative flex h-24 w-24 items-center justify-center">
            {/* rotating conic ring */}
            <div
              className={cn(
                "absolute inset-0 rounded-full opacity-70 blur-[2px]",
                "animate-[spin_10s_linear_infinite]"
              )}
              style={{
                background: isRejected
                  ? "conic-gradient(from 0deg, transparent, rgba(239,68,68,0.6), transparent 60%)"
                  : "conic-gradient(from 0deg, transparent, rgba(34,197,94,0.6), transparent 60%)",
              }}
            />
            {/* core tile */}
            <div className="relative flex h-[88px] w-[88px] items-center justify-center rounded-[26px] border border-white/10 bg-gradient-to-br from-navy-800 to-navy-900 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)]">
              <div
                className={cn(
                  "absolute inset-0 rounded-[26px] blur-xl",
                  isRejected ? "bg-bearish/20" : "bg-bullish/20"
                )}
              />
              {isRejected ? (
                <UserX className="relative h-9 w-9 text-bearish" />
              ) : (
                <Lock className="relative h-9 w-9 text-bullish" />
              )}
            </div>
          </div>
        </div>

        {/* Glass card */}
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-navy-850/70 p-7 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:p-8">
          {/* top accent */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-px",
              isRejected
                ? "bg-gradient-to-r from-transparent via-bearish/60 to-transparent"
                : "bg-gradient-to-r from-transparent via-bullish/60 to-transparent"
            )}
          />

          <div className="space-y-6 text-center">
            {/* Status badge */}
            <div className="flex justify-center">
              {isRejected ? (
                <Badge tone="danger" dot className="px-3 py-1.5 text-[11px]">
                  <UserX className="h-3.5 w-3.5" />
                  Account Deactivated
                </Badge>
              ) : (
                <Badge tone="neutral" dot className="px-3 py-1.5 text-[11px]">
                  <Clock className="h-3.5 w-3.5" />
                  Pending Approval
                </Badge>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-[26px]">
                {isRejected ? "Account Deactivated" : "Your account is under review"}
              </h1>
              <p className="mx-auto max-w-sm text-sm leading-relaxed text-slate-400">
                {isRejected
                  ? "Access to your account has been disabled by an administrator. Contact support below if you believe this is a mistake."
                  : "An administrator needs to approve your account before you can access the dashboard. This page updates automatically."}
              </p>
            </div>

            {/* Stepper */}
            <div className="rounded-2xl border border-white/5 bg-navy-900/50 p-5">
              <Stepper rejected={!!isRejected} />
            </div>

            {/* Waiting indicator (pending only) */}
            {!isRejected && (
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-bullish [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-bullish [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-bullish" />
                </span>
                Waiting for administrator approval…
              </div>
            )}

            {/* Info note */}
            <div
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-left",
                isRejected
                  ? "border-neutral/20 bg-neutral/[0.06]"
                  : "border-bullish/15 bg-bullish/[0.05]"
              )}
            >
              <div
                className={cn(
                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isRejected ? "bg-neutral/15 text-neutral" : "bg-bullish/15 text-bullish"
                )}
              >
                {isRejected ? (
                  <ShieldOff className="h-4 w-4" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
              </div>
              <div className="text-sm">
                <p className="font-medium text-white">
                  {isRejected ? "Need this resolved?" : "How to get approved"}
                </p>
                <p className="mt-0.5 leading-relaxed text-slate-400">
                  {isRejected
                    ? "Message our administrator and they will review your account and restore access."
                    : "Message our administrator to request approval. You'll be redirected to the dashboard the moment you're approved."}
                </p>
              </div>
            </div>

            {error && <InlineError>{error}</InlineError>}

            {/* Actions */}
            <div className="space-y-3 pt-1">
              <Button
                size="lg"
                className={cn(
                  "group relative w-full overflow-hidden font-semibold",
                  isRejected
                    ? "bg-neutral text-navy-950 hover:bg-amber-400"
                    : "bg-bullish text-navy-950 hover:bg-green-400"
                )}
                onClick={handleContactAdmin}
              >
                <span className="relative flex items-center justify-center gap-2">
                  <MessageCircle className="h-5 w-5 transition-transform group-hover:scale-110" />
                  Contact Administrator
                </span>
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              </Button>

              <Button
                variant="ghost"
                size="md"
                className="w-full text-slate-400 hover:text-slate-200"
                onClick={handleLogout}
              >
                <span className="flex items-center justify-center gap-2">
                  <X className="h-4 w-4" />
                  Sign out
                </span>
              </Button>
            </div>
          </div>
        </div>

        {/* Trust row */}
        <div className="mt-6 flex items-center justify-center gap-5 text-[11px] text-slate-600">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-bullish" />
            Secure
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-slate-500" />
            Admin notified
          </span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5 text-slate-500" />
            Encrypted
          </span>
        </div>
      </div>
    </div>
  );
}
