import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2, Cpu, MapPin, Package, Wrench, X } from "lucide-react";
import { AssetStatusBadge, MetroLineBadge, PriorityBadge, TicketStatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { StationDetailPanel } from "@/types";

export function StationSidePanel({
  detail,
  loading,
  onClose,
}: {
  detail: StationDetailPanel | null;
  loading: boolean;
  onClose: () => void;
}) {
  if (!detail && !loading) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        {detail ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {detail.node.location_code}
              </span>
              <MetroLineBadge line={detail.node.metro_line} />
            </div>
            <h3 className="mt-1.5 text-lg font-bold text-slate-900 dark:text-slate-100">{detail.node.name}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {detail.node.location_type.replace(/_/g, " ")}
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <MapPin className="h-4 w-4 animate-pulse" /> Loading Nandanam HQ zone telemetry...
          </div>
        )}
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
          Fetching HQ zone IT asset diagnostics...
        </div>
      )}

      {!loading && detail && (
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                <Cpu className="h-3.5 w-3.5 text-[#0066B3]" /> Total
              </div>
              <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{detail.node.total_assets}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Working
              </div>
              <p className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-300">{detail.node.working_count}</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-900/60 dark:bg-red-950/30">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Faulty
              </div>
              <p className="mt-1 text-xl font-bold text-red-700 dark:text-red-300">{detail.node.not_working_count}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                <Wrench className="h-3.5 w-3.5" /> Repair
              </div>
              <p className="mt-1 text-xl font-bold text-amber-700 dark:text-amber-300">{detail.node.under_repair_count}</p>
            </div>
          </div>

          {detail.node.in_store_count > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-medium text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4" /> Spare Assets Buffered in Store
              </span>
              <span className="font-bold">{detail.node.in_store_count}</span>
            </div>
          )}

          {/* Category Breakdown */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Category Breakdown
            </h4>
            {detail.category_breakdown.length === 0 ? (
              <p className="text-xs text-slate-500">No assets assigned to this node.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.category_breakdown.map((cat) => (
                  <div
                    key={cat.category_code}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                  >
                    <span className="font-mono font-bold text-[#0066B3] dark:text-sky-400">{cat.category_code}</span>
                    <span className="text-slate-600 dark:text-slate-300">{cat.category_name}</span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
                      {cat.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Maintenance Tickets */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Recent Maintenance Tickets
              </h4>
              <Link to="/maintenance" className="text-xs font-medium text-[#0066B3] hover:underline">
                View All
              </Link>
            </div>
            {detail.recent_tickets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800">
                No maintenance tickets recorded at this location.
              </div>
            ) : (
              <div className="space-y-2">
                {detail.recent_tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {t.ticket_number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <PriorityBadge priority={t.priority} />
                        <TicketStatusBadge status={t.status} />
                      </div>
                    </div>
                    <p className="mt-1 font-medium text-slate-700 dark:text-slate-300">
                      {t.asset_id} — {t.fault_category}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(t.reported_at)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Individual Assets at Station */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Assets at {detail.node.name} ({detail.assets.length})
            </h4>
            {detail.assets.length === 0 ? (
              <p className="text-xs text-slate-500">No IT assets deployed at this location.</p>
            ) : (
              <div className="space-y-2">
                {detail.assets.map((a) => (
                  <Link
                    key={a.id}
                    to={`/assets/${a.asset_id}`}
                    className="group flex items-center justify-between rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-[#0066B3] hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#0066B3] group-hover:underline dark:text-sky-400">
                          {a.asset_id}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {a.category_code}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs font-medium text-slate-800 dark:text-slate-200">{a.name}</p>
                      {a.assigned_to_name && (
                        <p className="truncate text-[11px] text-slate-500">{a.assigned_to_name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pl-2">
                      <AssetStatusBadge status={a.status} />
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-[#0066B3]" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
