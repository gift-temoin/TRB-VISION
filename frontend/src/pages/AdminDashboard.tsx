import {
  Activity,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminMessages } from "../components/admin/AdminMessages";
import { AdminModelHealth } from "../components/admin/AdminModelHealth";
import { AdminOverview } from "../components/admin/AdminOverview";
import { AdminPasscodes } from "../components/admin/AdminPasscodes";
import { AdminUsers } from "../components/admin/AdminUsers";
import { AdminVerification } from "../components/admin/AdminVerification";
import { Badge } from "../components/ui/Badge";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

type Tab = "overview" | "people" | "passcodes" | "messages" | "verification" | "health";

const TABS: { key: Tab; label: string; icon: typeof Users }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "people", label: "People", icon: Users },
  { key: "messages", label: "Messages", icon: MessageSquare },
  { key: "passcodes", label: "Passcodes", icon: KeyRound },
  { key: "verification", label: "Verification", icon: ShieldCheck },
  { key: "health", label: "Model health", icon: Activity },
];

export function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);

  const tabParam = searchParams.get("tab") as Tab | null;
  const tab: Tab = TABS.some((t) => t.key === tabParam) ? (tabParam as Tab) : "overview";

  const select = (t: Tab) => {
    setSearchParams(t === "overview" ? {} : { tab: t }, { replace: true });
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const s = await api.adminStats();
        if (active) {
          setPending(s.pending_users);
          setUnread(s.unread_messages);
        }
      } catch {
        /* ignore */
      }
    };
    void load();
    const t = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [tab]);

  const badgeFor = (key: Tab) => {
    if (key === "people" && pending > 0)
      return <Badge tone="bear">{pending}</Badge>;
    if (key === "messages" && unread > 0)
      return <Badge tone="bear">{unread}</Badge>;
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white sm:text-2xl">Administration</h1>
            <Badge tone="bull" dot>Premium</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Manage users, messages, verification, and system health.
          </p>
        </div>
      </div>

      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-gradient-to-br from-navy-900/90 to-navy-800/80 p-1 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.9)]">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => select(key)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200",
              tab === key
                ? "bg-gradient-to-br from-bullish/25 to-emerald-500/15 text-bullish shadow-[0_8px_30px_-18px_rgba(34,197,94,0.9)] ring-1 ring-inset ring-bullish/30"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className={cn("h-4 w-4", tab === key ? "text-bullish" : "text-slate-500")} />
            {label}
            {badgeFor(key)}
          </button>
        ))}
      </div>

      <div className="animate-fade-in">
        {tab === "overview" && <AdminOverview />}
        {tab === "people" && <AdminUsers />}
        {tab === "passcodes" && <AdminPasscodes />}
        {tab === "messages" && <AdminMessages />}
        {tab === "verification" && <AdminVerification />}
        {tab === "health" && <AdminModelHealth />}
      </div>
    </div>
  );
}
