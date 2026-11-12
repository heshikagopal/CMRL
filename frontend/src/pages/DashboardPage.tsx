import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  Archive,
  CheckCircle2,
  Cpu,
  Filter,
  Package,
  Radio,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { api } from "@/api/client";
import { MetroNetworkMap, type MapViewMode } from "@/components/MetroNetworkMap";
import { StationSidePanel } from "@/components/StationSidePanel";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { useLive } from "@/context/LiveContext";
import { cn } from "@/lib/utils";
import type { Category, DashboardResponse, Location, StationDetailPanel } from "@/types";

export function DashboardPage() {
  const { lastEventTick, connected } = useLive();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<MapViewMode>("HEALTH");

  // Filters (Nandanam Head Office only)
  const [locationId, setLocationId] = useState("");
  const [locationType, setLocationType] = useState("ALL");
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");

  // Master data for dropdowns
  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Side panel state
  const [selectedLocId, setSelectedLocId] = useState<number | null>(null);
  const [stationDetail, setStationDetail] = useState<StationDetailPanel | null>(null);
  const [stationLoading, setStationLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Location[]>("/locations"), api.get<Category[]>("/master/categories")])
      .then(([locRes, catRes]) => {
        setLocations(locRes.data);
        setCategories(catRes.data);
      })
      .catch(() => {});
  }, []);

  const fetchDashboard = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (locationId) params.location_id = locationId;
      if (locationType !== "ALL") params.location_type = locationType;
      if (categoryId) params.category_id = categoryId;
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;

      const res = await api.get<DashboardResponse>("/dashboard/monitor", { params });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [locationId, locationType, categoryId, statusFilter, dateFrom]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard, lastEventTick]);

  const handleSelectZone = async (locId: number) => {
    setSelectedLocId(locId);
    setStationLoading(true);
    try {
      const res = await api.get<StationDetailPanel>(`/dashboard/stations/${locId}`);
      setStationDetail(res.data);
    } finally {
      setStationLoading(false);
    }
  };

  const resetFilters = () => {
    setLocationId("");
    setLocationType("ALL");
    setCategoryId("");
    setStatusFilter("");
    setDateFrom("");
  };

  const c = data?.counters;

  return (
    <div className="space-y-5">
      <PageHeader
        title="CMRL NANDANAM HQ — IT ASSET MONITOR"
        subtitle="Real-time schematic IT asset telemetry across CMRL Head Office (MetroS, Nandanam) floors, wings, store & data centre"
        actions={
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                connected
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                  : "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              <Radio className={cn("h-3.5 w-3.5", connected && "animate-pulse")} />
              {connected ? "WebSocket Live" : "Live Sync"}
            </span>
            <Button variant="outline" size="sm" onClick={() => fetchDashboard()}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Control Room Live Activity Ticker */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0A192F] text-white shadow-sm">
        <div className="flex items-center">
          <div className="flex shrink-0 items-center gap-2 border-r border-white/10 bg-[#0066B3] px-3.5 py-2 text-xs font-bold uppercase tracking-wider">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            Nandanam HQ Feed
          </div>
          <div className="relative flex-1 overflow-hidden py-2">
            {data && data.ticker.length > 0 ? (
              <div className="animate-ticker gap-8 px-4 font-mono text-xs">
                {[...data.ticker, ...data.ticker].map((item, idx) => (
                  <Link
                    key={`${item.id}-${idx}`}
                    to={item.asset_id.startsWith("CMRL-IT-") ? `/assets/${item.asset_id}` : "/maintenance"}
                    className="inline-flex shrink-0 items-center gap-2 text-slate-200 hover:text-sky-300"
                  >
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        item.severity === "CRITICAL"
                          ? "bg-red-400"
                          : item.severity === "WARNING"
                            ? "bg-amber-400"
                            : "bg-emerald-400"
                      )}
                    />
                    <span className="font-bold text-sky-300">{item.asset_id}</span>
                    <span className="text-slate-400">|</span>
                    <span>{item.event_label}</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-emerald-300">{item.location_name}</span>
                    <span className="text-slate-400">|</span>
                    <span className="text-slate-400">{item.time_display}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-4 font-mono text-xs text-slate-400">Waiting for Nandanam HQ telemetry events...</p>
            )}
          </div>
        </div>
      </div>

      {/* Live Database Asset Counters (6 Status Cards) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Total IT Assets</span>
            <Cpu className="h-4 w-4 text-[#0066B3]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{c?.total_assets ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Nandanam HQ registry</p>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <span>Working</span>
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{c?.working ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Active across HQ floors</p>
        </Card>

        <Card className="border-l-4 border-l-red-500 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-red-700 dark:text-red-400">
            <span>Not Working</span>
            <AlertTriangle className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-red-700 dark:text-red-300">{c?.not_working ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Faults reported</p>
        </Card>

        <Card className="border-l-4 border-l-blue-500 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-blue-700 dark:text-blue-400">
            <span>In Store</span>
            <Package className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-700 dark:text-blue-300">{c?.in_store ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">2F Central IT Store</p>
        </Card>

        <Card className="border-l-4 border-l-amber-500 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-amber-700 dark:text-amber-400">
            <span>Under Repair</span>
            <Wrench className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">{c?.under_repair ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">2F Repair Lab / NOC</p>
        </Card>

        <Card className="border-l-4 border-l-slate-500 p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
            <span>Retired</span>
            <Archive className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-700 dark:text-slate-300">{c?.retired ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">Decommissioned</p>
        </Card>
      </div>

      {/* Filters & Heatmap Mode Switcher */}
      <Card className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Facility Type</label>
              <Select value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                <option value="ALL">All HQ Zones</option>
                <option value="OFFICE">Office Wings &amp; Lobby</option>
                <option value="DATA_CENTRE">Data Centre &amp; NOC</option>
                <option value="CENTRAL_STORE">Central IT Store</option>
                <option value="OTHER">IT Helpdesk &amp; Lab</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">HQ Floor / Zone</label>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">All Nandanam HQ Zones</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Category</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Status</label>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="WORKING">Working</option>
                <option value="NOT_WORKING">Not Working</option>
                <option value="IN_STORE">In Store</option>
                <option value="UNDER_REPAIR">Under Repair</option>
                <option value="RETIRED">Retired</option>
              </Select>
            </div>
            <div className="flex items-end gap-1.5">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">From Date</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <Button variant="ghost" size="sm" onClick={resetFilters} title="Clear filters" className="h-9 px-2.5">
                <Filter className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Heatmap Mode Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                { id: "HEALTH", label: "Asset Health View" },
                { id: "FAULT_DENSITY", label: "Fault Density View" },
                { id: "WARRANTY", label: "Warranty Expiry View" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                  viewMode === m.id
                    ? "bg-[#0066B3] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Interactive CMRL Nandanam HQ Building & IT Zone Schematic */}
      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Interactive Nandanam HQ Building &amp; IT Zone Schematic —{" "}
              {viewMode === "HEALTH"
                ? "Floor & Wing IT Health Status"
                : viewMode === "FAULT_DENSITY"
                  ? "Fault Density Heatmap"
                  : "30-Day Warranty Expiry Heatmap"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click any Nandanam Head Office floor, wing, central IT store, or data centre node to inspect assets and open tickets.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-emerald-600" /> All Working
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-amber-600" /> Attention / Repair
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-600" /> Critical Fault
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-slate-400" /> No Data
            </span>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex h-80 items-center justify-center text-sm text-slate-500">
            Loading Nandanam HQ Asset Monitor...
          </div>
        ) : (
          <MetroNetworkMap
            nodes={data?.nodes || []}
            viewMode={viewMode}
            selectedLocationId={selectedLocId}
            onSelectLocation={handleSelectZone}
          />
        )}

        {/* Operational Alert Strip */}
        {c && (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-3">
            <Link
              to="/maintenance"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs hover:border-[#0066B3] dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <Wrench className="h-4 w-4 text-amber-600" /> Open Maintenance Tickets
              </span>
              <span className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                {c.open_tickets} ({c.overdue_tickets} overdue)
              </span>
            </Link>

            <Link
              to="/reports"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs hover:border-[#0066B3] dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <ShieldAlert className="h-4 w-4 text-red-600" /> Warranties Expiring &le; 30d
              </span>
              <span className="font-mono text-sm font-bold text-red-600">{c.expiring_warranty_30d}</span>
            </Link>

            <Link
              to="/inventory"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs hover:border-[#0066B3] dark:border-slate-800 dark:bg-slate-950"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <Package className="h-4 w-4 text-[#0066B3]" /> Low-Stock Store Categories
              </span>
              <span className="font-mono text-sm font-bold text-amber-600">{c.low_stock_categories}</span>
            </Link>
          </div>
        )}
      </Card>

      {/* HQ Zone Summary Quick Grid */}
      <Card className="p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-slate-100">
          Nandanam HQ Floor &amp; Zone Telemetry Index
        </h3>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {(data?.nodes || []).map((n) => (
            <button
              key={n.location_id}
              onClick={() => handleSelectZone(n.location_id)}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3 text-left transition-all hover:border-[#0066B3]",
                selectedLocId === n.location_id
                  ? "border-[#0066B3] bg-sky-50/50 dark:bg-sky-950/20"
                  : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full",
                      n.health_status === "GREEN"
                        ? "bg-emerald-500"
                        : n.health_status === "AMBER"
                          ? "bg-amber-500"
                          : n.health_status === "RED"
                            ? "bg-red-500"
                            : "bg-slate-400"
                    )}
                  />
                  <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">{n.name}</span>
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-slate-400">
                  {n.location_code} • {n.location_type.replace(/_/g, " ")}
                </p>
              </div>
              <div className="pl-2 text-right font-mono text-xs">
                <span className="font-bold text-slate-900 dark:text-slate-100">{n.total_assets}</span>
                <span className="block text-[10px] text-slate-400">assets</span>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Click-to-inspect Zone Slide-Over Side Panel */}
      <StationSidePanel
        detail={stationDetail}
        loading={stationLoading}
        onClose={() => {
          setSelectedLocId(null);
          setStationDetail(null);
        }}
      />
    </div>
  );
}
