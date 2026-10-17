import { Users, UserCheck, UserX, MessageSquare, Server, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { AdminStats } from "../../types";
import { Badge, ModelBadge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { ErrorState } from "../ui/States";
import { LoadingState } from "../ui/Spinner";
import { cn } from "../../lib/utils";

function Metric({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "default" | "bull" | "warn" | "bear";
}) {
  const color =
    tone === "bull"
      ? "text-bullish"
      : tone === "warn"
        ? "text-neutral"
        : tone === "bear"
          ? "text-bearish"
          : "text-slate-400";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-navy-900/90 to-navy-800/70 p-5 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.9)] transition-all hover:shadow-[0_25px_60px_-30px_rgba(34,197,94,0.5)]">
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-bullish/15 to-transparent blur-2xl" />
      <div className="relative flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-widest text-slate-500">{label}</p>
        <span className={cn(color, "flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 backdrop-blur-sm")}>{icon}</span>
      </div>
      <p className="relative mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{value}</p>
    </div>
  );
}

export function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await api.adminStats());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading statistics…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!stats) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Total users" value={stats.total_users} icon={<Users className="h-4 w-4" />} />
        <Metric
          label="Verified"
          value={stats.verified_users}
          icon={<UserCheck className="h-4 w-4" />}
          tone="bull"
        />
        <Metric
          label="Active"
          value={stats.active_users}
          icon={<Users className="h-4 w-4" />}
        />
        <Metric
          label="Online now"
          value={stats.online_users ?? 0}
          icon={<Activity className="h-4 w-4" />}
          tone={(stats.online_users ?? 0) > 0 ? "bull" : "default"}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Pending"
          value={stats.pending_users}
          icon={<UserX className="h-4 w-4" />}
          tone="warn"
        />
        <Metric
          label="Total messages"
          value={stats.total_messages}
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <Metric
          label="Unread messages"
          value={stats.unread_messages}
          icon={<MessageSquare className="h-4 w-4" />}
          tone={stats.unread_messages > 0 ? "warn" : "default"}
        />
        <Metric
          label="Verified"
          value={stats.verified_users}
          icon={<UserCheck className="h-4 w-4" />}
          tone="bull"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Prediction provider"
            subtitle="Market data configuration"
            icon={<Server className="h-5 w-5" />}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{stats.provider_name}</p>
              <p className="text-xs text-slate-500">
                {stats.provider_configured
                  ? "A live provider is configured."
                  : "No live provider configured — predictions unavailable."}
              </p>
            </div>
            {stats.provider_configured ? (
              <Badge tone="bull" dot>
                Configured
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Not configured
              </Badge>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Prediction model"
            subtitle="Engine health"
            icon={<Activity className="h-5 w-5" />}
          />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">{stats.model_name}</p>
              <p className="text-xs text-slate-500">
                Probabilities are shown only when the model is calibrated and validated.
              </p>
            </div>
            <ModelBadge status={stats.model_status} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="System notes" subtitle="Operational reminders" />
        <ul className="space-y-2 text-sm text-slate-400">
          <li>• Passcodes are stored as hashes; plaintext codes are shown only once at creation.</li>
          <li>• Verification is enforced server-side on every prediction endpoint.</li>
          <li>• No automatic trading or broker execution is performed by this system.</li>
        </ul>
      </Card>
    </div>
  );
}
