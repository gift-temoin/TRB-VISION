import { Activity, AlertTriangle, Database, Server, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatDateTime, timeAgo } from "../../lib/utils";
import { Badge, ModelBadge } from "../ui/Badge";
import { Card, CardHeader } from "../ui/Card";
import { ErrorState } from "../ui/States";
import { LoadingState } from "../ui/Spinner";
import type { ModelStatus } from "../../types";

interface Health {
  provider_configured: boolean;
  provider_name: string;
  model_name: string;
  model_status: string;
  last_success: string | null;
  recent_errors: number;
  prediction_count: number;
}

export function AdminModelHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setHealth(await api.adminModelHealth());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load model health.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading model health…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!health) return null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Data provider"
            subtitle={health.provider_name}
            icon={<Server className="h-5 w-5" />}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Configuration status</p>
            {health.provider_configured ? (
              <Badge tone="bull" dot>
                Connected
              </Badge>
            ) : (
              <Badge tone="neutral" dot>
                Not configured
              </Badge>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <p className="text-sm text-slate-400">Last successful fetch</p>
            <p className="text-sm text-slate-200">
              {health.last_success ? timeAgo(health.last_success) : "—"}
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Prediction model"
            subtitle={health.model_name}
            icon={<Activity className="h-5 w-5" />}
          />
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Health status</p>
            <ModelBadge status={health.model_status as ModelStatus} />
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <p className="text-sm text-slate-400">Predictions generated</p>
            <p className="font-mono text-sm text-slate-200">{health.prediction_count}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Recent errors" subtitle="Provider and model issues in the last 24 hours" icon={<AlertTriangle className="h-5 w-5" />} />
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">Error count</p>
          {health.recent_errors > 0 ? (
            <Badge tone="bear" dot>
              {health.recent_errors} errors
            </Badge>
          ) : (
            <Badge tone="bull" dot>
              No errors
            </Badge>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3 text-sm text-slate-400">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <div>
            <p className="text-slate-300">
              Predictions are generated only from genuine market data. If data is unavailable,
              stale or invalid, signals are marked <span className="text-neutral">UNAVAILABLE</span>{" "}
              rather than fabricated. Probability estimates appear only when the model is
              calibrated and validated.
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              Snapshot generated {formatDateTime(new Date().toISOString())}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
