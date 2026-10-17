import { Search, ShieldOff, UserCheck, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { formatDateTime } from "../../lib/utils";
import type { User } from "../../types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ErrorState } from "../ui/States";
import { LoadingState } from "../ui/Spinner";

export function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "verified" | "pending">("pending");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.adminUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const matches = users.filter((u) => {
      if (tab === "verified" && !u.is_verified) return false;
      if (tab === "pending" && u.is_verified) return false;
      if (query) {
        const q = query.toLowerCase();
        return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }
      return true;
    });
    return matches.sort((a, b) => {
      if (a.is_verified !== b.is_verified) return a.is_verified ? 1 : -1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [users, tab, query]);

  const pendingCount = useMemo(() => users.filter((u) => !u.is_verified).length, [users]);

  const toggleActive = async (u: User) => {
    setBusyId(u.id);
    try {
      const updated = await api.adminSetUserActive(u.id, !u.is_active);
      setUsers((list) => list.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update user.");
    } finally {
      setBusyId(null);
    }
  };

  const resetVerification = async (u: User) => {
    setBusyId(u.id);
    try {
      const updated = await api.adminResetVerification(u.id);
      setUsers((list) => list.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset verification.");
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (u: User) => {
    setBusyId(u.id);
    try {
      const updated = await api.adminApproveUser(u.id);
      setUsers((list) => list.map((x) => (x.id === u.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to approve user.");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState label="Loading users…" />;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-navy-900 px-3 sm:w-72">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="h-9 w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="flex gap-1 rounded-xl border border-line bg-navy-900 p-1">
            {(["all", "verified", "pending"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  tab === t ? "bg-bullish/15 text-bullish" : "text-slate-400 hover:text-white"
                }`}
              >
                {t}
                {t === "pending" && pendingCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-bearish px-1 text-[10px] font-bold text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && <ErrorState title="Users" description={error} onRetry={() => void load()} />}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-500">
                    {tab === "pending"
                      ? "No accounts are awaiting approval."
                      : "No users match your filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.id} className="border-b border-line/60 last:border-0 hover:bg-white/2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-xs font-semibold text-slate-300">
                          {u.full_name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-white">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{u.email}</td>
                    <td className="px-5 py-3">
                      {u.is_active ? (
                        <Badge tone="bull" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="danger" dot>
                          Disabled
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {u.is_verified ? (
                        <Badge tone="info">
                          <UserCheck className="h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Pending</Badge>
                      )}
                      {u.is_admin && (
                        <span className="ml-2 text-[10px] uppercase text-bullish">Admin</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500">
                      {formatDateTime(u.created_at)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {!u.is_verified && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busyId === u.id}
                            onClick={() => void approve(u)}
                            icon={<UserCheck className="h-3.5 w-3.5" />}
                          >
                            Approve
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={u.is_active ? "outline" : "secondary"}
                          loading={busyId === u.id}
                          onClick={() => void toggleActive(u)}
                          icon={u.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                        >
                          {u.is_active ? "Disable" : "Enable"}
                        </Button>
                        {u.is_verified && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === u.id}
                            onClick={() => void resetVerification(u)}
                            icon={<ShieldOff className="h-3.5 w-3.5" />}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
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
