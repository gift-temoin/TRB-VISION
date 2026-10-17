import {
  Activity,
  Bitcoin,
  Brain,
  CandlestickChart,
  Coins,
  LayoutDashboard,
  ScanLine,
  Settings,
  Shield,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { cn } from "../../lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  end?: boolean;
}

const MAIN_NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/market/forex", label: "Forex", icon: TrendingUp },
  { to: "/market/gold", label: "Gold", icon: Coins },
  { to: "/market/crypto", label: "Crypto", icon: Bitcoin },
  { to: "/market/binary", label: "Binary Options", icon: Activity },
];

const TOOLS_NAV: NavItem[] = [
  { to: "/forex", label: "Forex Analysis", icon: CandlestickChart },
  { to: "/chartmind", label: "AI Chart Analyzer", icon: Brain },
  { to: "/analyze", label: "Chart Analyzer", icon: ScanLine },
];

// Admin navigation shown only to administrators.
const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin?tab=people", label: "People", icon: Shield },
  { to: "/admin?tab=messages", label: "Messages", icon: Activity },
  { to: "/admin?tab=passcodes", label: "Passcodes", icon: Settings },
  { to: "/admin?tab=verification", label: "Verification", icon: CandlestickChart },
  { to: "/admin?tab=health", label: "Model health", icon: Brain },
];

const FOOTER_NAV: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-bullish to-emerald-600 shadow-[0_6px_18px_-6px_rgba(34,197,94,0.8)]">
        <TrendingUp className="h-5 w-5 text-navy-950" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">TRB</p>
        <p className="text-[10px] uppercase tracking-widest text-slate-500">
          Robot Guider
        </p>
      </div>
    </div>
  );
}

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
          isActive
            ? "bg-bullish/10 text-white ring-1 ring-inset ring-bullish/25"
            : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            className={cn(
              "h-[18px] w-[18px] transition-colors",
              isActive ? "text-bullish" : "text-slate-500 group-hover:text-slate-300"
            )}
          />
          <span>{item.label}</span>
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-bullish shadow-[0_0_8px_rgba(34,197,94,0.9)]" />
          )}
        </>
      )}
    </NavLink>
  );
}

export function Sidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo />
        <button
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 lg:hidden"
          onClick={onClose}
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {user?.is_admin ? (
          <div>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Administration
            </p>
            <div className="space-y-1">
              {ADMIN_NAV.map((item) => (
                <NavRow key={item.to} item={item} onNavigate={onClose} />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Markets
              </p>
              <div className="space-y-1">
                {MAIN_NAV.map((item) => (
                  <NavRow key={item.to} item={item} onNavigate={onClose} />
                ))}
              </div>
            </div>

            <div>
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                Tools
              </p>
              <div className="space-y-1">
                {TOOLS_NAV.map((item) => (
                  <NavRow key={item.to} item={item} onNavigate={onClose} />
                ))}
              </div>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <div className="space-y-1">
          {FOOTER_NAV.map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onClose} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-line bg-navy-900/70 backdrop-blur lg:flex">
        {content}
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
