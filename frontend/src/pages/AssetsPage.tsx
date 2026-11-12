import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Plus,
  QrCode,
  Search,
} from "lucide-react";
import { api, downloadAuthorizedFile } from "@/api/client";
import { QRLabelModal } from "@/components/QRLabelModal";
import { AssetStatusBadge } from "@/components/StatusBadge";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/utils";
import type { Asset, AssetListResponse, Category, Location } from "@/types";

export function AssetsPage() {
  const { hasRole } = useAuth();
  const canRegister = hasRole("ADMIN", "STORE_KEEPER");

  const [data, setData] = useState<AssetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState("asset_id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [qrAsset, setQrAsset] = useState<Asset | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  useEffect(() => {
    Promise.all([api.get<Category[]>("/master/categories"), api.get<Location[]>("/locations")]).then(
      ([cRes, lRes]) => {
        setCategories(cRes.data);
        setLocations(lRes.data);
      }
    );
  }, []);

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<AssetListResponse>("/assets", {
        params: {
          search: search || undefined,
          category_id: categoryId || undefined,
          location_id: locationId || undefined,
          status: statusFilter || undefined,
          sort_by: sortBy,
          sort_dir: sortDir,
          page,
          page_size: 15,
        },
      });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [search, categoryId, locationId, statusFilter, sortBy, sortDir, page]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const toggleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const toggleSelect = (aid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(aid)) next.delete(aid);
      else next.add(aid);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    const items = data?.items || [];
    const allSelected = items.length > 0 && items.every((i) => selectedIds.has(i.asset_id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach((i) => next.delete(i.asset_id));
      } else {
        items.forEach((i) => next.add(i.asset_id));
      }
      return next;
    });
  };

  const handleExport = async (fmt: "csv" | "xlsx") => {
    const params = new URLSearchParams({ format: fmt });
    if (search) params.set("search", search);
    if (categoryId) params.set("category_id", categoryId);
    if (locationId) params.set("location_id", locationId);
    if (statusFilter) params.set("status", statusFilter);
    await downloadAuthorizedFile(`/api/assets/export?${params.toString()}`, `cmrl_assets.${fmt}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asset Management"
        subtitle="Permanent CMRL IT Asset Register with lifecycle tracking, QR labels, and filterable exports"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
            {canRegister && (
              <Link to="/assets/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Register Asset
                </Button>
              </Link>
            )}
          </>
        }
      />

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search Asset ID, Name, Serial, Model, Employee..."
              className="pl-9"
            />
          </div>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="WORKING">Working</option>
            <option value="NOT_WORKING">Not Working</option>
            <option value="IN_STORE">In Store</option>
            <option value="UNDER_REPAIR">Under Repair</option>
            <option value="RETIRED">Retired</option>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            <span className="font-semibold">{selectedIds.size} asset(s) selected</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
                Export Filtered Excel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear Selection
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Asset Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      (data?.items.length || 0) > 0 &&
                      (data?.items || []).every((i) => selectedIds.has(i.asset_id))
                    }
                    onChange={toggleAllOnPage}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("asset_id")}>
                  <span className="inline-flex items-center gap-1">
                    Asset ID <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("name")}>
                  <span className="inline-flex items-center gap-1">
                    Asset Name <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Assigned To</th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("status")}>
                  <span className="inline-flex items-center gap-1">
                    Status <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="cursor-pointer px-4 py-3" onClick={() => toggleSort("warranty_end")}>
                  <span className="inline-flex items-center gap-1">
                    Warranty <ArrowUpDown className="h-3 w-3" />
                  </span>
                </th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                    Loading CMRL asset register...
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                    No IT assets match the current filters.
                  </td>
                </tr>
              ) : (
                data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(a.asset_id)}
                        onChange={() => toggleSelect(a.asset_id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#0066B3] dark:text-sky-400">
                      <Link to={`/assets/${a.asset_id}`} className="hover:underline">
                        {a.asset_id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{a.name}</p>
                      <p className="text-xs text-slate-400">
                        {a.manufacturer} {a.model} • SN: {a.serial_number}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {a.category.code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300">{a.location.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {a.assigned_to_name || "Unassigned"}
                    </td>
                    <td className="px-4 py-3">
                      <AssetStatusBadge status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(a.warranty_end)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Link
                          to={`/assets/${a.asset_id}`}
                          title="View Asset Dossier & History"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0066B3] dark:hover:bg-slate-800"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setQrAsset(a)}
                          title="QR Tag & Printable Label"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#009E49] dark:hover:bg-slate-800"
                        >
                          <QrCode className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 sm:flex-row">
            <span>
              Showing page <strong>{data.page}</strong> of <strong>{data.total_pages}</strong> ({data.total} total assets)
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.total_pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <QRLabelModal asset={qrAsset} open={!!qrAsset} onClose={() => setQrAsset(null)} />
    </div>
  );
}
