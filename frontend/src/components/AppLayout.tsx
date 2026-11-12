import React, { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Box,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Moon,
  PlusCircle,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  Wifi,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { api } from "@/api/client";
import { AssetStatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useLive } from "@/context/LiveContext";
import { useTheme } from "@/context/ThemeContext";
import { cn, formatDateTime } from "@/lib/utils";
import type { RoleName } from "@/types";

interface NavItem {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: RoleName[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Asset Management", to: "/assets", icon: Box },
  { label: "Add New Asset", to: "/assets/new", icon: PlusCircle, roles: ["ADMIN", "STORE_KEEPER"] },
  { label: "QR Scanner", to: "/scanner", icon: QrCode },
  { label: "Asset Movement", to: "/movements", icon: ArrowLeftRight },
  { label: "Fault & Maintenance", to: "/maintenance", icon: Wrench },
  { label: "Inventory / Store", to: "/inventory", icon: Activity },
  { label: "Locations", to: "/locations", icon: MapPin },
  { label: "Reports & Analytics", to: "/reports", icon: BarChart3 },
  { label: "User Management", to: "/users", icon: Users, roles: ["ADMIN"] },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { connected, notifications, unreadCount, markRead, markAllRead } = useLive();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<{
    assets: { id: number; asset_id: string; name: string; status: string; location: string }[];
    tickets: { id: number; ticket_number: string; asset_id: string; priority: string; status: string }[];
    locations: { id: number; location_code: string; name: string }[];
  } | null>(null);
  const searchBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length < 2) {
      setSearchResults(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get("/dashboard/search", { params: { q: trimmed } });
        setSearchResults(res.data);
      } catch {
        setSearchResults(null);
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleNav = NAV_ITEMS.filter((item) => !item.roles || (user && item.roles.includes(user.role.name)));

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Mobile Sidebar Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Deep Navy Sidebar */}
      <aside
        className={cn(
          "no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#0A192F] text-slate-200 transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#0066B3] to-[#009E49] font-mono text-sm font-bold text-white shadow">
              CM
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight text-white">CMRL ITAM</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-sky-300/80">
                Nandanam HQ Control
              </p>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Metro Dual Accent Bar */}
        <div className="flex h-1">
          <div className="w-1/2 bg-[#0066B3]" />
          <div className="w-1/2 bg-[#009E49]" />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/assets" || item.to === "/dashboard"}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[#0066B3] text-white shadow-sm"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
            <span className="flex items-center gap-1.5 text-slate-300">
              {connected ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              )}
              Live Telemetry
            </span>
            <span className={cn("font-semibold", connected ? "text-emerald-400" : "text-amber-400")}>
              {connected ? "ONLINE" : "POLLING"}
            </span>
          </div>
          <p className="mt-2 px-1 text-[10px] leading-tight text-slate-400">
            Internal Enterprise Prototype • Fictional Demo Data
          </p>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Header */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-xs dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
          <div className="flex flex-1 items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* Global Search */}
            <div ref={searchBoxRef} className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Asset ID (e.g. CMRL-IT-LAP-0001), serial, ticket, HQ zone..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0066B3] focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              {searchResults && (
                <div className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                  {searchResults.assets.length === 0 &&
                    searchResults.tickets.length === 0 &&
                    searchResults.locations.length === 0 && (
                      <p className="p-3 text-xs text-slate-500">No matching records found.</p>
                    )}

                  {searchResults.assets.length > 0 && (
                    <div className="mb-2">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        IT Assets
                      </p>
                      {searchResults.assets.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchTerm("");
                            navigate(`/assets/${a.asset_id}`);
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <div>
                            <span className="font-mono font-bold text-[#0066B3] dark:text-sky-400">{a.asset_id}</span>
                            <span className="ml-2 font-medium text-slate-800 dark:text-slate-200">{a.name}</span>
                            <span className="block text-[11px] text-slate-500">{a.location}</span>
                          </div>
                          <AssetStatusBadge status={a.status} />
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.tickets.length > 0 && (
                    <div className="mb-2">
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Maintenance Tickets
                      </p>
                      {searchResults.tickets.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchTerm("");
                            navigate("/maintenance");
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              {t.ticket_number}
                            </span>{" "}
                            ({t.asset_id})
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">{t.status}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {searchResults.locations.length > 0 && (
                    <div>
                      <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Locations
                      </p>
                      {searchResults.locations.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => {
                            setSearchResults(null);
                            setSearchTerm("");
                            navigate("/locations");
                          }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className="font-medium">{l.name}</span>
                          <span className="font-mono text-[11px] text-slate-400">{l.location_code}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              title="Toggle light/dark mode"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {/* Notifications Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-11 z-40 w-80 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:w-96">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <span className="text-sm font-semibold">Alerts &amp; Notifications</span>
                    <button
                      onClick={() => markAllRead()}
                      className="text-xs font-medium text-[#0066B3] hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-center text-xs text-slate-500">No notifications.</p>
                    ) : (
                      notifications.slice(0, 12).map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={cn(
                            "cursor-pointer px-4 py-3 text-xs transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50",
                            !n.is_read && "bg-sky-50/50 dark:bg-sky-950/20"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "font-semibold",
                                n.severity === "CRITICAL"
                                  ? "text-red-600 dark:text-red-400"
                                  : n.severity === "WARNING"
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-slate-900 dark:text-slate-100"
                              )}
                            >
                              {n.title}
                            </span>
                            {!n.is_read && <span className="h-2 w-2 rounded-full bg-[#0066B3]" />}
                          </div>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{n.message}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{formatDateTime(n.created_at)}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile & Role Indicator */}
            {user && (
              <div className="flex items-center gap-2.5 border-l border-slate-200 pl-3 dark:border-slate-700">
                <div className="hidden text-right sm:block">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">{user.full_name}</p>
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0066B3] dark:bg-slate-800 dark:text-sky-300">
                    <ShieldCheck className="h-3 w-3" />
                    {user.role.name.replace("_", " ")}
                  </span>
                </div>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login");
                  }}
                  title="Sign out"
                  className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:hover:bg-red-950/40"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
