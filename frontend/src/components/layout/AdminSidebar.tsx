import {
  Activity,

  KeyRound,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

interface AdminNavItem {
  tab: string;
  label: string;
  icon: LucideIcon;
  badge?: "pending" | "unread";
}

interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

const NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "Command",
    items: [{ tab: "overview", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "Community",
    items: [
      { tab: "people", label: "People", icon: Users, badge: "pending" },
      { tab: "messages", label: "Messages", icon: MessageSquare, badge: "unread" },
    ],
  },
  {
    title: "Security",
    items: [
      { tab: "verification", label: "Verification", icon: ShieldCheck },
      { tab: "passcodes", label: "Passcodes", icon: KeyRound },
    ],
  },
  {
    title: "System",
    items: [{ tab: "health", label: "Model health", icon: Activity }],
  },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-bullish to-emerald-600 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.8)]">
        <Shield className="h-5 w-5 text-navy-950" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">TRB</p>
        <p className="text-[10px] uppercase tracking-widest text-bullish/80">Admin Console</p>
      </div>
    </div>
  );
}

export function AdminSidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState(0);
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(0);

  const currentTab =
    location.pathname.startsWith("/admin") ? (searchParams.get("tab") ?? "overview") : "__none__";

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const s = await api.adminStats();
        if (!active) return;
        setPending(s.pending_users);
        setUnread(s.unread_messages);
        setOnline(s.online_users ?? 0);
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
  }, []);

  const initials = (user?.full_name ?? "AD")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-4 pt-5">
        <Logo />
        <button
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="mx-3 mb-2 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-navy-800/80 to-navy-900/50 p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-bullish/80 to-emerald-700 text-xs font-bold text-navy-950">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-bullish">
              <ShieldCheck className="h-3 w-3" /> Administrator
            </p>
          </div>
        </div>
      </div>

      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              {group.title}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = currentTab === item.tab;
                const count =
                  item.badge === "pending" ? pending : item.badge === "unread" ? unread : 0;
                return (
                  <Link
                    key={item.tab}
                    to={item.tab === "overview" ? "/admin" : `/admin?tab=${item.tab}`}
                    onClick={onClose}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-gradient-to-r from-bullish/20 to-transparent text-white ring-1 ring-inset ring-bullish/25"
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-bullish shadow-[0_0_12px_rgba(34,197,94,0.9)]" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        active ? "text-bullish" : "text-slate-500 group-hover:text-slate-300"
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-bearish px-1.5 text-[10px] font-bold text-white">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-line px-3 py-3">
        <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-navy-800/70 to-navy-900/40 p-3.5">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-bullish/10 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bullish/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-bullish" />
                </span>
                <span className="ml-2">System operational</span>
              </p>
            </div>
          </div>
          <p className="relative mt-2 text-[11px] text-slate-400">
            <span className="font-semibold text-bullish">{online}</span> user(s) online now
          </p>
        </div>

        <Link
          to="/settings"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-slate-100"
        >
          <Settings className="h-4 w-4 text-slate-500" />
          Settings
        </Link>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-bearish/90 transition-colors hover:bg-bearish/10 hover:text-bearish"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="relative hidden w-64 shrink-0 border-r border-line bg-navy-900/70 backdrop-blur lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-bullish/5 to-transparent" />
        <div className="relative flex w-full">{content}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/70 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 w-72 animate-fade-in border-r border-line bg-navy-900 shadow-2xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
