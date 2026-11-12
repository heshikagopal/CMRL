import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeftRight, Check, Plus, Search, X } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { cn, formatDate } from "@/lib/utils";
import type { Asset, AssetMovement, Location } from "@/types";

export function MovementsPage() {
  const { hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const canTransfer = hasRole("ADMIN", "STORE_KEEPER");
  const isAdmin = hasRole("ADMIN");

  const [movements, setMovements] = useState<AssetMovement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal
  const [openModal, setOpenModal] = useState(!!searchParams.get("asset"));
  const [assetCode, setAssetCode] = useState(searchParams.get("asset") || "");
  const [toLocationId, setToLocationId] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [issuedTo, setIssuedTo] = useState("");
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [requireApproval, setRequireApproval] = useState(false);
  const [formErr, setFormErr] = useState("");

  const fetchMovements = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AssetMovement[]>("/movements", {
        params: {
          search: search || undefined,
          approval_status: statusFilter || undefined,
        },
      });
      setMovements(res.data);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  useEffect(() => {
    Promise.all([
      api.get<Location[]>("/locations"),
      api.get<{ items: Asset[] }>("/assets", { params: { page_size: 150 } }),
    ]).then(([l, a]) => {
      setLocations(l.data);
      setAssets(a.data.items.filter((x) => x.status !== "RETIRED"));
    });
  }, []);

  const selectedAsset = assets.find((a) => a.asset_id === assetCode);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    try {
      await api.post("/movements", {
        asset_code_or_id: assetCode,
        to_location_id: Number(toLocationId),
        transfer_date: transferDate,
        issued_to: issuedTo || null,
        reason,
        remarks: remarks || null,
        require_approval: requireApproval,
      });
      setOpenModal(false);
      setReason("");
      setRemarks("");
      fetchMovements();
    } catch (err) {
      setFormErr(getApiErrorMessage(err, "Failed to submit transfer"));
    }
  };

  const handleDecision = async (movId: number, action: "APPROVE" | "REJECT") => {
    await api.post(`/movements/${movId}/decision`, { action });
    fetchMovements();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Movement & Transfers"
        subtitle="Inter-floor & inter-wing transfers within CMRL Nandanam Head Office while preserving permanent Asset IDs"
        actions={
          canTransfer && (
            <Button size="sm" onClick={() => setOpenModal(true)}>
              <Plus className="h-4 w-4" /> New Asset Transfer
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Movement No, Asset ID, Reason..."
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Approval States</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending Approval</option>
            <option value="REJECTED">Rejected</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3">Movement No</th>
                <th className="px-4 py-3">Permanent Asset ID</th>
                <th className="px-4 py-3">From Location</th>
                <th className="px-4 py-3">To Location</th>
                <th className="px-4 py-3">Transfer Date</th>
                <th className="px-4 py-3">Issued To</th>
                <th className="px-4 py-3">Approval</th>
                <th className="px-4 py-3">Reason</th>
                {isAdmin && <th className="px-4 py-3 text-right">Decision</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    Loading movement history...
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                    No asset movements found.
                  </td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {m.movement_number}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/assets/${m.asset_id}`}
                        className="font-mono font-bold text-[#0066B3] hover:underline dark:text-sky-400"
                      >
                        {m.asset_id}
                      </Link>
                      <span className="block text-slate-500">{m.asset_name}</span>
                    </td>
                    <td className="px-4 py-3">{m.from_location_name}</td>
                    <td className="px-4 py-3 font-semibold text-[#009E49] dark:text-emerald-400">
                      {m.to_location_name}
                    </td>
                    <td className="px-4 py-3">{formatDate(m.transfer_date)}</td>
                    <td className="px-4 py-3">{m.issued_to || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                          m.approval_status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : m.approval_status === "PENDING"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                              : "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300"
                        )}
                      >
                        {m.approval_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate" title={m.reason}>
                      {m.reason}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        {m.approval_status === "PENDING" ? (
                          <div className="inline-flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDecision(m.id, "APPROVE")}
                              title="Approve transfer"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => handleDecision(m.id, "REJECT")}
                              title="Reject transfer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">{m.approved_by_name || "Auto"}</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Transfer Asset Between Nandanam HQ Zones">
        <form onSubmit={handleSubmit} className="space-y-4">
          {formErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{formErr}</div>}
          <div>
            <label className="mb-1 block text-xs font-semibold">Select Asset *</label>
            <Select required value={assetCode} onChange={(e) => setAssetCode(e.target.value)}>
              <option value="">Select asset...</option>
              {assets.map((a) => (
                <option key={a.id} value={a.asset_id}>
                  {a.asset_id} — {a.name} ({a.location.name})
                </option>
              ))}
            </Select>
          </div>
          {selectedAsset && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 p-2.5 text-xs dark:bg-slate-800">
              <ArrowLeftRight className="h-4 w-4 text-[#0066B3]" />
              <span>
                From: <strong>{selectedAsset.location.name}</strong>
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">To Location *</label>
              <Select required value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>
                <option value="">Destination...</option>
                {locations
                  .filter((l) => l.id !== selectedAsset?.location.id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Transfer Date</label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Issued To (Employee / Desk)</label>
            <Input value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} placeholder="Recipient name or HQ wing/room" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Reason *</label>
            <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Floor wing reallocation, swap..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Remarks</label>
            <Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
            />
            Queue for Admin approval before moving asset
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpenModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Submit Transfer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
