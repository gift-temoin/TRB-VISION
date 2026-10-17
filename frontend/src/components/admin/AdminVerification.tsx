import { CheckCircle2, History, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { ErrorState } from "../ui/States";
import { LoadingState } from "../ui/Spinner";

interface Row {
  id: number;
  user_id: number;
  user_name: string;
  success: boolean;
  created_at: string;
  ip: string | null;
}

export function AdminVerification() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.adminVerificationHistory());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load verification history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (loading) return <LoadingState label="Loading verification history…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const successCount = rows.filter((r) => r.success).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Badge tone="info">
          <History className="h-3 w-3" /> {rows.length} attempts
        </Badge>
        <Badge tone="bull">
          <CheckCircle2 className="h-3 w-3" /> {successCount} successful
        </Badge>
        <Badge tone="bear">
          <XCircle className="h-3 w-3" /> {rows.length - successCount} failed
        </Badge>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Result</th>
                <th className="px-5 py-3 font-medium">IP address</th>
                <th className="px-5 py-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-500">
                    No verification attempts recorded.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-3 text-white">{r.user_name}</td>
                    <td className="px-5 py-3">
                      {r.success ? (
                        <Badge tone="bull" dot>
                          Success
                        </Badge>
                      ) : (
                        <Badge tone="bear" dot>
                          Failed
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">
                      {r.ip ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDateTime(r.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
