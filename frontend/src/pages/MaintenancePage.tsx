import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Search,
  Wrench,
} from "lucide-react";
import { api, getApiErrorMessage, resolveBackendUrl } from "@/api/client";
import { PriorityBadge, TicketStatusBadge } from "@/components/StatusBadge";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { formatDateTime } from "@/lib/utils";
import type { Asset, MaintenanceTicket } from "@/types";

interface TicketSummary {
  open_tickets: number;
  pending_tickets: number;
  resolved_tickets: number;
  overdue_tickets: number;
  avg_resolution_hours: number;
}

export function MaintenancePage() {
  const { hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const canReport = hasRole("ADMIN", "TECHNICIAN", "STORE_KEEPER");
  const canRepair = hasRole("ADMIN", "TECHNICIAN");

  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [summary, setSummary] = useState<TicketSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);

  const [assets, setAssets] = useState<Asset[]>([]);
  const [techs, setTechs] = useState<{ id: number; full_name: string; employee_id: string }[]>([]);

  // Report Fault Modal
  const [createOpen, setCreateOpen] = useState(!!searchParams.get("asset"));
  const [assetCode, setAssetCode] = useState(searchParams.get("asset") || "");
  const [faultCat, setFaultCat] = useState("Hardware Failure");
  const [priority, setPriority] = useState("HIGH");
  const [description, setDescription] = useState("");
  const [assignedTechId, setAssignedTechId] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [createErr, setCreateErr] = useState("");

  // Ticket Repair Workspace Modal
  const [activeTicket, setActiveTicket] = useState<MaintenanceTicket | null>(null);
  const [updStatus, setUpdStatus] = useState("IN_PROGRESS");
  const [updTechId, setUpdTechId] = useState("");
  const [repairNotes, setRepairNotes] = useState("");
  const [spareParts, setSpareParts] = useState("");
  const [targetAssetStatus, setTargetAssetStatus] = useState("");
  const [updErr, setUpdErr] = useState("");

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ items: MaintenanceTicket[]; summary: TicketSummary }>("/tickets", {
        params: {
          search: search || undefined,
          status: statusFilter || undefined,
          priority: priorityFilter || undefined,
          assigned_to_me: assignedToMe || undefined,
        },
      });
      setTickets(res.data.items);
      setSummary(res.data.summary);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter, assignedToMe]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    Promise.all([
      api.get<{ items: Asset[] }>("/assets", { params: { page_size: 150 } }),
      api.get<{ id: number; full_name: string; employee_id: string }[]>("/tickets/technicians"),
    ]).then(([aRes, tRes]) => {
      setAssets(aRes.data.items.filter((x) => x.status !== "RETIRED"));
      setTechs(tRes.data);
    });
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateErr("");
    try {
      const res = await api.post<MaintenanceTicket>("/tickets", {
        asset_code_or_id: assetCode,
        fault_category: faultCat,
        priority,
        description,
        assigned_to: assignedTechId ? Number(assignedTechId) : null,
      });
      if (photoFile) {
        const fd = new FormData();
        fd.append("file", photoFile);
        await api.post(`/tickets/${res.data.ticket_number}/photo`, fd);
      }
      setCreateOpen(false);
      setDescription("");
      setPhotoFile(null);
      fetchTickets();
    } catch (err) {
      setCreateErr(getApiErrorMessage(err, "Failed to report fault"));
    }
  };

  const handleAcceptTicket = async (tnum: string) => {
    const res = await api.post<MaintenanceTicket>(`/tickets/${tnum}/accept`);
    setActiveTicket(res.data);
    fetchTickets();
  };

  const handleUpdateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    setUpdErr("");
    try {
      const res = await api.post<MaintenanceTicket>(`/tickets/${activeTicket.ticket_number}/update`, {
        status: updStatus,
        assigned_to: updTechId ? Number(updTechId) : null,
        repair_notes: repairNotes,
        spare_parts_used: spareParts || null,
        asset_target_status: targetAssetStatus || null,
      });
      setActiveTicket(res.data);
      setRepairNotes("");
      setSpareParts("");
      fetchTickets();
    } catch (err) {
      setUpdErr(getApiErrorMessage(err, "Failed to update repair ticket"));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Fault & Maintenance Management"
        subtitle="End-to-end fault ticketing (CMRL-TKT), SLA monitoring, technician assignments & repair workflows"
        actions={
          canReport && (
            <Button variant="danger" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Report Asset Fault
            </Button>
          )
        }
      />

      {/* Maintenance KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Open Tickets</p>
          <p className="mt-1 text-2xl font-bold text-red-600">{summary?.open_tickets ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">In Progress / Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{summary?.pending_tickets ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Resolved / Closed</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">{summary?.resolved_tickets ?? "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Avg Resolution Time</p>
          <p className="mt-1 text-2xl font-bold text-[#0066B3]">{summary ? `${summary.avg_resolution_hours}h` : "—"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-500">Overdue SLA</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{summary?.overdue_tickets ?? "—"}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Ticket ID, Asset ID, fault category..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Ticket Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_SPARE_PARTS">Waiting Spare Parts</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </Select>
          <div className="flex items-center gap-2">
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
            <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium">
              <input
                type="checkbox"
                checked={assignedToMe}
                onChange={(e) => setAssignedToMe(e.target.checked)}
              />
              Mine
            </label>
          </div>
        </div>
      </Card>

      {/* Tickets Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3">Ticket No</th>
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Fault Category</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Technician</th>
                <th className="px-4 py-3">Reported</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    Loading maintenance tickets...
                  </td>
                </tr>
              ) : tickets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No maintenance tickets match filters.
                  </td>
                </tr>
              ) : (
                tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                      {t.ticket_number}
                      {t.is_overdue && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          <Clock className="h-2.5 w-2.5" /> OVERDUE
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${t.asset_id}`}
                        className="font-mono font-bold text-[#0066B3] hover:underline dark:text-sky-400"
                      >
                        {t.asset_id}
                      </Link>
                      <span className="block text-slate-500">{t.asset_name}</span>
                    </td>
                    <td className="px-4 py-3">{t.location_name}</td>
                    <td className="px-4 py-3 font-medium">{t.fault_category}</td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <TicketStatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3">{t.assigned_to_name || "Unassigned"}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(t.reported_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setActiveTicket(t);
                          setUpdStatus(t.status === "OPEN" ? "IN_PROGRESS" : t.status);
                          setUpdTechId(t.assigned_to ? String(t.assigned_to) : "");
                          setTargetAssetStatus("");
                        }}
                      >
                        <Wrench className="h-3.5 w-3.5" /> Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Report Fault Modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Report IT Asset Fault">
        <form onSubmit={handleCreateTicket} className="space-y-4">
          {createErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{createErr}</div>}
          <div>
            <label className="mb-1 block text-xs font-semibold">Select Affected Asset *</label>
            <Select required value={assetCode} onChange={(e) => setAssetCode(e.target.value)}>
              <option value="">Choose asset...</option>
              {assets.map((a) => (
                <option key={a.id} value={a.asset_id}>
                  {a.asset_id} — {a.name} ({a.location.name})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Fault Category *</label>
              <Select value={faultCat} onChange={(e) => setFaultCat(e.target.value)}>
                <option value="Hardware Failure">Hardware Failure</option>
                <option value="Network Connectivity">Network Connectivity</option>
                <option value="Power / Battery">Power / Battery</option>
                <option value="Camera Offline">Camera Offline</option>
                <option value="Peripheral Fault">Peripheral Fault</option>
                <option value="Storage Array">Storage Array</option>
                <option value="OS / Software">OS / Software</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Priority *</label>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Assign Technician (Optional)</label>
            <Select value={assignedTechId} onChange={(e) => setAssignedTechId(e.target.value)}>
              <option value="">Leave in Open Queue</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.employee_id})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Fault Description *</label>
            <Textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe hardware error, indicator lights, or impact..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Supporting Photograph (Optional)</label>
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-slate-500"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Create Ticket &amp; Flag Asset
            </Button>
          </div>
        </form>
      </Modal>

      {/* Ticket Detail & Technician Repair Modal */}
      <Modal
        open={!!activeTicket}
        onClose={() => setActiveTicket(null)}
        title={activeTicket ? `${activeTicket.ticket_number} — ${activeTicket.asset_id}` : ""}
        subtitle={activeTicket ? `${activeTicket.location_name} • ${activeTicket.fault_category}` : ""}
        maxWidth="max-w-2xl"
      >
        {activeTicket && (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority={activeTicket.priority} />
                  <TicketStatusBadge status={activeTicket.status} />
                  {activeTicket.is_overdue && (
                    <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> Overdue SLA
                    </span>
                  )}
                </div>
                {canRepair && activeTicket.status in { OPEN: 1, ASSIGNED: 1 } && (
                  <Button size="sm" variant="secondary" onClick={() => handleAcceptTicket(activeTicket.ticket_number)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Accept &amp; Start Repair
                  </Button>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-800 dark:text-slate-200">{activeTicket.description}</p>
              {activeTicket.supporting_photo_url && (
                <a
                  href={resolveBackendUrl(activeTicket.supporting_photo_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-[#0066B3] hover:underline"
                >
                  View Supporting Fault Photo
                </a>
              )}
            </div>

            {/* Repair Logs Timeline */}
            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Maintenance Log</h4>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {activeTicket.updates.map((u) => (
                  <div key={u.id} className="rounded border border-slate-200 p-2.5 text-xs dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {u.updated_by_name} → {u.new_status.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(u.created_at)}</span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">{u.repair_notes}</p>
                    {u.spare_parts_used && (
                      <p className="mt-1 font-mono text-[11px] text-[#0066B3]">Spare Parts: {u.spare_parts_used}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {canRepair && activeTicket.status !== "CLOSED" && (
              <form onSubmit={handleUpdateTicket} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Add Technician Repair Update</h4>
                {updErr && <div className="rounded bg-red-50 p-2 text-xs text-red-700">{updErr}</div>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Ticket Status</label>
                    <Select value={updStatus} onChange={(e) => setUpdStatus(e.target.value)}>
                      <option value="ASSIGNED">Assigned</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="WAITING_SPARE_PARTS">Waiting Spare Parts</option>
                      <option value="RESOLVED">Resolved</option>
                      <option value="CLOSED">Closed</option>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Assigned Technician</label>
                    <Select value={updTechId} onChange={(e) => setUpdTechId(e.target.value)}>
                      <option value="">Keep current</option>
                      {techs.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.full_name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold">Resulting Asset Status</label>
                    <Select value={targetAssetStatus} onChange={(e) => setTargetAssetStatus(e.target.value)}>
                      <option value="">Auto-sync from ticket</option>
                      <option value="UNDER_REPAIR">Under Repair</option>
                      <option value="WORKING">Working (Repaired)</option>
                      <option value="IN_STORE">In Store (Spare)</option>
                      <option value="RETIRED">Retired (Beyond Repair)</option>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Repair Notes *</label>
                  <Textarea
                    required
                    rows={2}
                    value={repairNotes}
                    onChange={(e) => setRepairNotes(e.target.value)}
                    placeholder="Diagnostics, replacement actions, verification test..."
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">Spare Parts Used (Optional)</label>
                  <Input
                    value={spareParts}
                    onChange={(e) => setSpareParts(e.target.value)}
                    placeholder="e.g. Cisco PWR-C5-125WAC, 12V Battery Bank"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setActiveTicket(null)}>
                    Close
                  </Button>
                  <Button type="submit">Save Repair Update</Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
