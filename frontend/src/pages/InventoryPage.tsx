import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Package, Plus, SlidersHorizontal } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { AssetStatusBadge } from "@/components/StatusBadge";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { cn, formatDateTime } from "@/lib/utils";
import type { Asset, InventoryCategorySummary, InventoryTransaction, Location } from "@/types";

interface InventorySummaryResponse {
  categories: InventoryCategorySummary[];
  spare_assets: Asset[];
  deployed_assets: Asset[];
  transactions: InventoryTransaction[];
}

export function InventoryPage() {
  const { hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const canOperate = hasRole("ADMIN", "STORE_KEEPER");

  const [data, setData] = useState<InventorySummaryResponse | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"spares" | "deployed" | "transactions">("spares");

  // Issue / Return Modal
  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opAction, setOpAction] = useState<"ISSUE" | "RETURN">("ISSUE");
  const [opAssetId, setOpAssetId] = useState(searchParams.get("asset") || "");
  const [opLocId, setOpLocId] = useState("");
  const [opIssuedTo, setOpIssuedTo] = useState("");
  const [opRemarks, setOpRemarks] = useState("");
  const [opErr, setOpErr] = useState("");

  // Threshold Modal
  const [threshCat, setThreshCat] = useState<InventoryCategorySummary | null>(null);
  const [threshVal, setThreshVal] = useState("2");

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, locRes] = await Promise.all([
        api.get<InventorySummaryResponse>("/inventory/summary"),
        api.get<Location[]>("/locations"),
      ]);
      setData(invRes.data);
      setLocations(locRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const openIssueForAsset = (asset: Asset) => {
    setOpAction("ISSUE");
    setOpAssetId(asset.asset_id);
    setOpLocId("");
    setOpIssuedTo("");
    setOpRemarks("");
    setOpErr("");
    setOpModalOpen(true);
  };

  const openReturnForAsset = (asset: Asset) => {
    const centralStore = locations.find((l) => l.location_code === "HQ-2F-STR");
    setOpAction("RETURN");
    setOpAssetId(asset.asset_id);
    setOpLocId(centralStore ? String(centralStore.id) : "");
    setOpIssuedTo("");
    setOpRemarks("");
    setOpErr("");
    setOpModalOpen(true);
  };

  const handleIssueReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpErr("");
    try {
      await api.post("/inventory/issue-return", {
        asset_code_or_id: opAssetId,
        action: opAction,
        target_location_id: Number(opLocId),
        issued_to: opAction === "ISSUE" ? opIssuedTo : null,
        remarks: opRemarks || null,
      });
      setOpModalOpen(false);
      fetchSummary();
    } catch (err) {
      setOpErr(getApiErrorMessage(err, "Store operation failed"));
    }
  };

  const handleThresholdSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!threshCat) return;
    await api.patch(`/inventory/categories/${threshCat.category_id}/threshold`, {
      low_stock_threshold: Number(threshVal),
    });
    setThreshCat(null);
    fetchSummary();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory & Central Store Management"
        subtitle="Track spare stock levels across IT categories, configure low-stock alerts, and issue or receive assets"
        actions={
          canOperate && (
            <>
              <Link to="/assets/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Register New Stock
                </Button>
              </Link>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setOpAction("ISSUE");
                  setOpAssetId("");
                  setOpLocId("");
                  setOpIssuedTo("");
                  setOpRemarks("");
                  setOpErr("");
                  setOpModalOpen(true);
                }}
              >
                <ArrowUpRight className="h-4 w-4" /> Issue / Return Asset
              </Button>
            </>
          )
        }
      />

      {/* Category Stock Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(data?.categories || []).map((cat) => (
          <Card
            key={cat.category_id}
            className={cn(
              "p-4",
              cat.is_low_stock && "border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20"
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-[#0066B3] dark:bg-slate-800 dark:text-sky-400">
                  {cat.code}
                </span>
                <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-slate-100">{cat.name}</h3>
              </div>
              {canOperate && (
                <button
                  onClick={() => {
                    setThreshCat(cat);
                    setThreshVal(String(cat.low_stock_threshold));
                  }}
                  title="Configure low-stock threshold"
                  className="rounded p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-3 flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold text-[#0066B3] dark:text-sky-400">{cat.in_store_count}</span>
                <span className="ml-1 text-xs text-slate-500">in store</span>
              </div>
              <span className="text-xs text-slate-500">Total fleet: {cat.total_assets}</span>
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-slate-200/80 pt-2 text-[11px] dark:border-slate-800">
              <span className="text-slate-500">Min Alert: {cat.low_stock_threshold}</span>
              {cat.is_low_stock ? (
                <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> Low Stock
                </span>
              ) : (
                <span className="font-semibold text-emerald-600">Healthy Buffer</span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Tabs: Available Spares / Deployed Assets / Store Ledger */}
      <Card className="overflow-hidden">
        <div className="flex border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-950">
          {[
            { id: "spares", label: `Available Spare Assets (${data?.spare_assets.length ?? 0})` },
            { id: "deployed", label: `Deployed / Issued Assets (${data?.deployed_assets.length ?? 0})` },
            { id: "transactions", label: `Store Transaction Ledger (${data?.transactions.length ?? 0})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as typeof tab)}
              className={cn(
                "border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
                tab === t.id
                  ? "border-[#0066B3] text-[#0066B3] dark:text-sky-400"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-10 text-center text-sm text-slate-500">Loading store inventory...</div>
          ) : tab === "spares" ? (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Asset ID</th>
                  <th className="px-4 py-3">Asset Name</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Store Location</th>
                  <th className="px-4 py-3">Status</th>
                  {canOperate && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.spare_assets || []).map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-mono font-bold text-[#0066B3]">
                      <Link to={`/assets/${a.asset_id}`} className="hover:underline">
                        {a.asset_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {a.name}
                      <span className="block text-[11px] text-slate-400">
                        {a.manufacturer} {a.model}
                      </span>
                    </td>
                    <td className="px-4 py-3">{a.category.name}</td>
                    <td className="px-4 py-3">{a.location.name}</td>
                    <td className="px-4 py-3">
                      <AssetStatusBadge status={a.status} />
                    </td>
                    {canOperate && (
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => openIssueForAsset(a)}>
                          <ArrowUpRight className="h-3.5 w-3.5" /> Issue Asset
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tab === "deployed" ? (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Asset ID</th>
                  <th className="px-4 py-3">Asset Name</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Issued To</th>
                  <th className="px-4 py-3">Status</th>
                  {canOperate && <th className="px-4 py-3 text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.deployed_assets || []).map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3 font-mono font-bold text-[#0066B3]">
                      <Link to={`/assets/${a.asset_id}`} className="hover:underline">
                        {a.asset_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium">{a.name}</td>
                    <td className="px-4 py-3">{a.location.name}</td>
                    <td className="px-4 py-3">{a.assigned_to_name || "—"}</td>
                    <td className="px-4 py-3">
                      <AssetStatusBadge status={a.status} />
                    </td>
                    {canOperate && (
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => openReturnForAsset(a)}>
                          <ArrowDownLeft className="h-3.5 w-3.5" /> Receive Return
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-3">Txn No</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Asset ID</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Issued To</th>
                  <th className="px-4 py-3">Performed By</th>
                  <th className="px-4 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(data?.transactions || []).map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-3 font-mono font-semibold">{tx.transaction_number}</td>
                    <td className="px-4 py-3 font-bold text-[#0066B3]">{tx.transaction_type}</td>
                    <td className="px-4 py-3 font-mono">{tx.asset_id}</td>
                    <td className="px-4 py-3">{tx.location_name}</td>
                    <td className="px-4 py-3">{tx.issued_to || "—"}</td>
                    <td className="px-4 py-3">{tx.performed_by_name}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(tx.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Issue / Return Modal */}
      <Modal
        open={opModalOpen}
        onClose={() => setOpModalOpen(false)}
        title={opAction === "ISSUE" ? "Issue Spare Asset from Store" : "Receive Returned Asset into Store"}
      >
        <form onSubmit={handleIssueReturnSubmit} className="space-y-4">
          {opErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{opErr}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Operation</label>
              <Select value={opAction} onChange={(e) => setOpAction(e.target.value as "ISSUE" | "RETURN")}>
                <option value="ISSUE">Issue to HQ Wing / User</option>
                <option value="RETURN">Return to 2F Central Store</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Asset ID *</label>
              <Select required value={opAssetId} onChange={(e) => setOpAssetId(e.target.value)}>
                <option value="">Select asset...</option>
                {(opAction === "ISSUE" ? data?.spare_assets : data?.deployed_assets)?.map((a) => (
                  <option key={a.id} value={a.asset_id}>
                    {a.asset_id} — {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {opAction === "ISSUE" ? "Target HQ Floor / Wing *" : "Receiving Store / Repair Bay *"}
            </label>
            <Select required value={opLocId} onChange={(e) => setOpLocId(e.target.value)}>
              <option value="">Select location...</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.location_type})
                </option>
              ))}
            </Select>
          </div>
          {opAction === "ISSUE" && (
            <div>
              <label className="mb-1 block text-xs font-semibold">Issued To (Employee / Desk) *</label>
              <Input
                required
                value={opIssuedTo}
                onChange={(e) => setOpIssuedTo(e.target.value)}
                placeholder="e.g. 4F Engineering CAD Desk 2"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold">Remarks</label>
            <Textarea rows={2} value={opRemarks} onChange={(e) => setOpRemarks(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Package className="h-4 w-4" /> Confirm {opAction === "ISSUE" ? "Issue" : "Return"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Low Stock Threshold Modal */}
      <Modal
        open={!!threshCat}
        onClose={() => setThreshCat(null)}
        title={`Configure Low-Stock Alert — ${threshCat?.name}`}
      >
        <form onSubmit={handleThresholdSave} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold">Minimum Spare Stock Threshold</label>
            <Input
              type="number"
              min={0}
              max={500}
              required
              value={threshVal}
              onChange={(e) => setThreshVal(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setThreshCat(null)}>
              Cancel
            </Button>
            <Button type="submit">Save Threshold</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
