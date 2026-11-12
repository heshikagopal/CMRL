import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  History,
  MapPin,
  Printer,
  QrCode,
  ShieldCheck,
  UserCheck,
  Wrench,
} from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { QRLabelModal } from "@/components/QRLabelModal";
import { AssetStatusBadge, PriorityBadge, TicketStatusBadge } from "@/components/StatusBadge";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { cn, formatCurrencyINR, formatDate, formatDateTime } from "@/lib/utils";
import type {
  Asset,
  AssetJourneyEvent,
  AssetMovement,
  Location,
  MaintenanceTicket,
  StatusHistoryItem,
} from "@/types";

interface AssetDetailResponse {
  asset: Asset;
  status_history: StatusHistoryItem[];
  tickets: MaintenanceTicket[];
  movements: AssetMovement[];
  attachments: { id: number; entity_type: string; file_name: string; url: string; created_at: string }[];
  journey: AssetJourneyEvent[];
}

export function AssetDetailPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canEdit = hasRole("ADMIN", "STORE_KEEPER");
  const canChangeStatus = hasRole("ADMIN", "TECHNICIAN", "STORE_KEEPER");

  const [detail, setDetail] = useState<AssetDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"journey" | "maintenance" | "movements" | "status">("journey");
  const [qrOpen, setQrOpen] = useState(false);

  // Status Modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("WORKING");
  const [statusRemarks, setStatusRemarks] = useState("");
  const [assignedName, setAssignedName] = useState("");
  const [statusErr, setStatusErr] = useState("");

  // Edit Metadata Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editAssigned, setEditAssigned] = useState("");
  const [editWarrantyEnd, setEditWarrantyEnd] = useState("");
  const [editRemarks, setEditRemarks] = useState("");

  // Report Fault Modal
  const [faultModalOpen, setFaultModalOpen] = useState(false);
  const [faultCategory, setFaultCategory] = useState("Hardware Failure");
  const [faultPriority, setFaultPriority] = useState("HIGH");
  const [faultDesc, setFaultDesc] = useState("");
  const [faultErr, setFaultErr] = useState("");

  // Transfer Modal
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [toLocId, setToLocId] = useState("");
  const [transferIssuedTo, setTransferIssuedTo] = useState("");
  const [transferReason, setTransferReason] = useState("");
  const [transferErr, setTransferErr] = useState("");

  const fetchDetail = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get<AssetDetailResponse>(`/assets/${encodeURIComponent(assetId)}/detail`);
      setDetail(res.data);
      setNewStatus(res.data.asset.status);
      setAssignedName(res.data.asset.assigned_to_name || "");
      setEditName(res.data.asset.name);
      setEditAssigned(res.data.asset.assigned_to_name || "");
      setEditWarrantyEnd(res.data.asset.warranty_end || "");
      setEditRemarks(res.data.asset.remarks || "");
    } catch (err) {
      setError(getApiErrorMessage(err, "Asset could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (transferModalOpen && locations.length === 0) {
      api.get<Location[]>("/locations").then((r) => setLocations(r.data));
    }
  }, [transferModalOpen, locations.length]);

  const handleStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setStatusErr("");
    try {
      await api.post(`/assets/${detail.asset.asset_id}/status`, {
        new_status: newStatus,
        remarks: statusRemarks,
        assigned_to_name: assignedName,
      });
      setStatusModalOpen(false);
      setStatusRemarks("");
      fetchDetail();
    } catch (err) {
      setStatusErr(getApiErrorMessage(err, "Could not update status"));
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    await api.put(`/assets/${detail.asset.asset_id}`, {
      name: editName,
      assigned_to_name: editAssigned,
      warranty_end: editWarrantyEnd || null,
      remarks: editRemarks,
    });
    setEditModalOpen(false);
    fetchDetail();
  };

  const handleReportFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setFaultErr("");
    try {
      await api.post("/tickets", {
        asset_code_or_id: detail.asset.asset_id,
        fault_category: faultCategory,
        priority: faultPriority,
        description: faultDesc,
      });
      setFaultModalOpen(false);
      setFaultDesc("");
      fetchDetail();
    } catch (err) {
      setFaultErr(getApiErrorMessage(err, "Failed to report fault"));
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setTransferErr("");
    try {
      await api.post("/movements", {
        asset_code_or_id: detail.asset.asset_id,
        to_location_id: Number(toLocId),
        issued_to: transferIssuedTo || null,
        reason: transferReason,
      });
      setTransferModalOpen(false);
      setTransferReason("");
      fetchDetail();
    } catch (err) {
      setTransferErr(getApiErrorMessage(err, "Transfer failed"));
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-sm text-slate-500">Loading asset dossier...</div>;
  }

  if (error || !detail) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-base font-semibold text-red-600">{error || "Asset not found"}</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate("/assets")}>
          Back to Asset Register
        </Button>
      </Card>
    );
  }

  const a = detail.asset;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link to="/assets" className="inline-flex items-center gap-1 hover:text-[#0066B3]">
          <ArrowLeft className="h-3.5 w-3.5" /> Asset Register
        </Link>
        <span>/</span>
        <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{a.asset_id}</span>
      </div>

      <PageHeader
        title={`${a.asset_id} — ${a.name}`}
        subtitle={`${a.manufacturer} ${a.model} • Serial: ${a.serial_number}`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
              <Printer className="h-3.5 w-3.5" /> Print QR Tag
            </Button>
            {canChangeStatus && a.status !== "RETIRED" && (
              <Button variant="danger" size="sm" onClick={() => setFaultModalOpen(true)}>
                <AlertTriangle className="h-3.5 w-3.5" /> Report Fault
              </Button>
            )}
            {canEdit && a.status !== "RETIRED" && (
              <Button variant="outline" size="sm" onClick={() => setTransferModalOpen(true)}>
                <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer Location
              </Button>
            )}
            {canChangeStatus && a.status !== "RETIRED" && (
              <Button size="sm" onClick={() => setStatusModalOpen(true)}>
                Update Status
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)}>
                <Edit3 className="h-3.5 w-3.5" /> Edit
              </Button>
            )}
          </>
        }
      />

      {/* Top Dossier Cards */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Technical Overview */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Asset Specifications &amp; Status</h2>
            <AssetStatusBadge status={a.status} />
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Permanent Asset ID</p>
              <p className="font-mono font-bold text-[#0066B3] dark:text-sky-400">{a.asset_id}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Category</p>
              <p className="font-semibold">{a.category.name} ({a.category.code})</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Serial Number</p>
              <p className="font-mono font-medium">{a.serial_number}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Current Location</p>
              <p className="inline-flex items-center gap-1 font-semibold">
                <MapPin className="h-3.5 w-3.5 text-[#009E49]" /> {a.location.name}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Assigned Custodian</p>
              <p className="inline-flex items-center gap-1 font-medium">
                <UserCheck className="h-3.5 w-3.5 text-slate-400" /> {a.assigned_to_name || "Unassigned / Store"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Department</p>
              <p className="font-medium">{a.department?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Vendor</p>
              <p className="font-medium">{a.vendor?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Purchase Date / Cost</p>
              <p className="font-medium">
                {formatDate(a.purchase_date)} • {formatCurrencyINR(a.purchase_cost)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Warranty Period</p>
              <p className="inline-flex items-center gap-1 font-medium">
                <ShieldCheck className="h-3.5 w-3.5 text-[#0066B3]" />
                {formatDate(a.warranty_start)} → {formatDate(a.warranty_end)}
              </p>
            </div>
          </div>

          {a.description && (
            <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              <strong className="text-slate-800 dark:text-slate-200">Description:</strong> {a.description}
            </div>
          )}

          {/* Attachments */}
          {(a.photo_url || a.invoice_url || detail.attachments.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
              {a.photo_url && (
                <a
                  href={a.photo_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View Asset Photo
                </a>
              )}
              {a.invoice_url && (
                <a
                  href={a.invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50 dark:border-slate-700"
                >
                  <FileText className="h-3.5 w-3.5" /> View Purchase Invoice
                </a>
              )}
            </div>
          )}
        </Card>

        {/* QR Tag Card */}
        <Card className="flex flex-col items-center justify-between p-5 text-center">
          <div className="w-full">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1">
                <QrCode className="h-4 w-4 text-[#0066B3]" /> Asset QR Identity
              </span>
              <span className="font-mono text-[11px]">{a.category.code}</span>
            </div>
            <div className="my-4 flex justify-center">
              <img
                src={a.qr_image_url || `/api/assets/${a.asset_id}/qr`}
                alt={`QR Code for ${a.asset_id}`}
                className="h-44 w-auto rounded-lg border border-slate-200 bg-white p-1"
              />
            </div>
            <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{a.asset_id}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">Permanent QR — never changes across transfers</p>
          </div>
          <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => setQrOpen(true)}>
            Open Printable Asset Tag
          </Button>
        </Card>
      </div>

      {/* Tabs: Asset Journey Timeline / Maintenance / Movements / Status History */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-950">
          {(
            [
              { id: "journey", label: `Asset Journey (${detail.journey.length})`, icon: Clock },
              { id: "maintenance", label: `Fault Tickets (${detail.tickets.length})`, icon: Wrench },
              { id: "movements", label: `Movements (${detail.movements.length})`, icon: ArrowLeftRight },
              { id: "status", label: `Status History (${detail.status_history.length})`, icon: History },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
                  activeTab === t.id
                    ? "border-[#0066B3] text-[#0066B3] dark:text-sky-400"
                    : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5">
          {activeTab === "journey" && (
            <div className="relative space-y-5 pl-6 before:absolute before:bottom-2 before:left-2.5 before:top-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {detail.journey.map((ev) => (
                <div key={ev.id} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[21px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900",
                      ev.event_type === "TICKET"
                        ? "bg-red-500"
                        : ev.event_type === "MOVEMENT"
                          ? "bg-[#0066B3]"
                          : "bg-[#009E49]"
                    )}
                  />
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{ev.title}</p>
                      <span className="font-mono text-[11px] text-slate-400">{formatDateTime(ev.timestamp)}</span>
                    </div>
                    {ev.remarks && <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{ev.remarks}</p>}
                    <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                      Recorded by: <span className="text-slate-700 dark:text-slate-300">{ev.actor_name}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "maintenance" && (
            <div className="space-y-3">
              {detail.tickets.length === 0 ? (
                <p className="text-sm text-slate-500">No fault or maintenance tickets logged for this asset.</p>
              ) : (
                detail.tickets.map((t) => (
                  <div key={t.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#0066B3]">{t.ticket_number}</span>
                        <span className="text-xs font-semibold">{t.fault_category}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={t.priority} />
                        <TicketStatusBadge status={t.status} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t.description}</p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      Reported {formatDateTime(t.reported_at)} by {t.reported_by_name}
                      {t.assigned_to_name ? ` • Technician: ${t.assigned_to_name}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "movements" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Movement No</th>
                    <th className="py-2 pr-4">From</th>
                    <th className="py-2 pr-4">To</th>
                    <th className="py-2 pr-4">Issued To</th>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        No location transfers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    detail.movements.map((m) => (
                      <tr key={m.id}>
                        <td className="py-2.5 pr-4 font-mono font-bold text-[#0066B3]">{m.movement_number}</td>
                        <td className="py-2.5 pr-4">{m.from_location_name}</td>
                        <td className="py-2.5 pr-4 font-semibold">{m.to_location_name}</td>
                        <td className="py-2.5 pr-4">{m.issued_to || "—"}</td>
                        <td className="py-2.5 pr-4">{formatDate(m.transfer_date)}</td>
                        <td className="py-2.5 pr-4 font-semibold">{m.approval_status}</td>
                        <td className="py-2.5">{m.reason}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "status" && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800">
                  <tr>
                    <th className="py-2 pr-4">Timestamp</th>
                    <th className="py-2 pr-4">Previous Status</th>
                    <th className="py-2 pr-4">New Status</th>
                    <th className="py-2 pr-4">Changed By</th>
                    <th className="py-2">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detail.status_history.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-4 font-mono text-slate-500">{formatDateTime(s.changed_at)}</td>
                      <td className="py-2.5 pr-4">{s.previous_status ? <AssetStatusBadge status={s.previous_status} /> : "—"}</td>
                      <td className="py-2.5 pr-4"><AssetStatusBadge status={s.new_status} /></td>
                      <td className="py-2.5 pr-4 font-medium">{s.changed_by_name}</td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-300">{s.remarks || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Modals */}
      <QRLabelModal asset={a} open={qrOpen} onClose={() => setQrOpen(false)} />

      <Modal open={statusModalOpen} onClose={() => setStatusModalOpen(false)} title={`Update Status — ${a.asset_id}`}>
        <form onSubmit={handleStatusSubmit} className="space-y-4">
          {statusErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{statusErr}</div>}
          <div>
            <label className="mb-1 block text-xs font-semibold">New Lifecycle Status *</label>
            <Select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              <option value="WORKING">WORKING</option>
              <option value="NOT_WORKING">NOT WORKING</option>
              <option value="IN_STORE">IN STORE</option>
              <option value="UNDER_REPAIR">UNDER REPAIR</option>
              <option value="RETIRED">RETIRED (Terminal)</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Assigned Employee / Custodian</label>
            <Input value={assignedName} onChange={(e) => setAssignedName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Audit Remarks *</label>
            <Textarea required rows={3} value={statusRemarks} onChange={(e) => setStatusRemarks(e.target.value)} placeholder="Reason for status transition..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setStatusModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Status Change</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)} title={`Edit Asset Metadata — ${a.asset_id}`}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Asset Name</label>
            <Input required value={editName} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Assigned Custodian</label>
            <Input value={editAssigned} onChange={(e) => setEditAssigned(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Warranty End Date</label>
            <Input type="date" value={editWarrantyEnd} onChange={(e) => setEditWarrantyEnd(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Remarks</label>
            <Textarea rows={2} value={editRemarks} onChange={(e) => setEditRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>Cancel</Button>
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </Modal>

      <Modal open={faultModalOpen} onClose={() => setFaultModalOpen(false)} title={`Report Fault — ${a.asset_id}`}>
        <form onSubmit={handleReportFault} className="space-y-4">
          {faultErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{faultErr}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Fault Category</label>
              <Select value={faultCategory} onChange={(e) => setFaultCategory(e.target.value)}>
                <option value="Hardware Failure">Hardware Failure</option>
                <option value="Network Connectivity">Network Connectivity</option>
                <option value="Power / Battery">Power / Battery</option>
                <option value="Camera Offline">Camera Offline</option>
                <option value="Peripheral Fault">Peripheral Fault</option>
                <option value="OS / Software">OS / Software</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Priority</label>
              <Select value={faultPriority} onChange={(e) => setFaultPriority(e.target.value)}>
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Fault Description *</label>
            <Textarea required rows={3} value={faultDesc} onChange={(e) => setFaultDesc(e.target.value)} placeholder="Describe symptoms and HQ zone impact..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFaultModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger">Log Fault Ticket</Button>
          </div>
        </form>
      </Modal>

      <Modal open={transferModalOpen} onClose={() => setTransferModalOpen(false)} title={`Transfer Asset — ${a.asset_id}`}>
        <form onSubmit={handleTransfer} className="space-y-4">
          {transferErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{transferErr}</div>}
          <p className="text-xs text-slate-500">
            Current Location: <strong>{a.location.name}</strong> (Permanent ID {a.asset_id} will not change)
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold">Destination Location *</label>
            <Select required value={toLocId} onChange={(e) => setToLocId(e.target.value)}>
              <option value="">Select destination...</option>
              {locations
                .filter((l) => l.id !== a.location.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.location_code})
                  </option>
                ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Issued To (Employee / Desk)</label>
            <Input value={transferIssuedTo} onChange={(e) => setTransferIssuedTo(e.target.value)} placeholder="New custodian name" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Transfer Reason *</label>
            <Input required value={transferReason} onChange={(e) => setTransferReason(e.target.value)} placeholder="Operational reallocation, replacement..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setTransferModalOpen(false)}>Cancel</Button>
            <Button type="submit">Execute Transfer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
