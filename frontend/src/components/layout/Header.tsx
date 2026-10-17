import { Bell, LogOut, Menu, MessageSquare, Search, ShieldCheck, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../lib/api";
import { countryFlag, countryName } from "../../lib/countries";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/Badge";

export function Header({
  onOpenSidebar,
  onOpenChat,
}: {
  onOpenSidebar: () => void;
  onOpenChat: () => void;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await api.unreadCount();
        if (active) setUnread(user?.is_admin ? res.admin : res.user);
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
  }, [user?.is_admin]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-navy-900/80 px-4 backdrop-blur-md sm:px-6">
      <button
        className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="hidden items-center gap-2 rounded-xl border border-line bg-navy-900/60 px-3 sm:flex sm:w-72">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          className="h-9 w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          placeholder="Search instruments, markets…"
          aria-label="Search"
        />
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {user?.is_verified ? (
          <span className="hidden sm:block">
            <Badge tone="bull" dot>
              Verified
            </Badge>
          </span>
        ) : (
          <span className="hidden sm:block">
            <Badge tone="neutral" dot>
              Unverified
            </Badge>
          </span>
        )}

        {user?.country && (
          <span
            className="flex items-center gap-1.5 rounded-xl border border-line bg-navy-900/60 px-2.5 py-1.5"
            title={`Registered in ${user.country_name ?? countryName(user.country)}`}
          >
            <span className="text-base leading-none" aria-hidden>
              {user.country_flag || countryFlag(user.country)}
            </span>
            <span className="hidden text-xs font-medium text-slate-300 md:inline">
              {user.country_name ?? countryName(user.country)}
            </span>
          </span>
        )}

        <button
          onClick={() => (user?.is_admin ? navigate("/admin?tab=messages") : onOpenChat())}
          className="relative rounded-xl p-2 text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
          aria-label={user?.is_admin ? "Messages" : "Notifications"}
        >
          {user?.is_admin ? <MessageSquare className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-bearish px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl p-1 pr-2 transition-colors hover:bg-white/5"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-bullish/80 to-emerald-700 text-xs font-bold text-navy-950">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-xs font-semibold text-white">
                {user?.full_name}
              </span>
              <span className="block text-[10px] text-slate-500">
                {user?.is_admin ? "Administrator" : "Trader"}
              </span>
            </span>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-56 animate-fade-in overflow-hidden rounded-2xl border border-line bg-navy-800 shadow-card"
              role="menu"
            >
              <div className="border-b border-line px-4 py-3">
                <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
                {user?.country && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
                    <span aria-hidden>{user.country_flag || countryFlag(user.country)}</span>
                    {user.country_name ?? countryName(user.country)}
                  </p>
                )}
                {user?.is_admin && (
                  <span className="mt-2 inline-flex items-center gap-1 text-[11px] text-bullish">
                    <ShieldCheck className="h-3.5 w-3.5" /> Admin access
                  </span>
                )}
              </div>
              <button
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-white/5"
                onClick={() => {
                  setMenuOpen(false);
                  navigate("/settings");
                }}
                role="menuitem"
              >
                <UserIcon className="h-4 w-4" /> Account settings
              </button>
              <button
                className={cn(
                  "flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-bearish hover:bg-bearish/10"
                )}
                onClick={async () => {
                  await logout();
                  navigate("/login");
                }}
                role="menuitem"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
