import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { api, downloadAuthorizedFile } from "@/api/client";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import type { Category, Location } from "@/types";

const REPORT_TYPES = [
  { id: "asset_register", label: "1. Total Asset Register" },
  { id: "asset_status", label: "2. Asset Status Report" },
  { id: "station_wise", label: "3. Floor / Zone-wise Asset Report" },
  { id: "category_wise", label: "4. Category-wise Asset Report" },
  { id: "fault_maintenance", label: "5. Fault & Maintenance Report" },
  { id: "asset_movement", label: "6. Asset Movement Report" },
  { id: "warranty_expiry", label: "7. Warranty Expiry Report" },
  { id: "spare_inventory", label: "8. Spare Inventory Report" },
  { id: "retired_assets", label: "9. Retired Asset Report" },
];

const STATUS_COLORS: Record<string, string> = {
  WORKING: "#16A34A",
  NOT_WORKING: "#DC2626",
  IN_STORE: "#0284C7",
  UNDER_REPAIR: "#D97706",
  RETIRED: "#64748B",
};

interface AnalyticsData {
  status_distribution: { name: string; status: string; value: number }[];
  category_distribution: { name: string; count: number }[];
  station_distribution: { name: string; working: number; faulty: number; total: number }[];
  monthly_fault_trends: { month: string; reported: number; resolved: number }[];
  warranty_overview: { bucket: string; count: number }[];
  ticket_metrics: { total: number; open: number; resolved: number; avg_resolution_hours: number };
}

interface ReportPreview {
  report_type: string;
  title: string;
  headers: string[];
  rows: (string | number)[][];
  total_rows: number;
}

export function ReportsPage() {
  const [reportType, setReportType] = useState("asset_register");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [locations, setLocations] = useState<Location[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Location[]>("/locations"), api.get<Category[]>("/master/categories")]).then(
      ([lRes, cRes]) => {
        setLocations(lRes.data);
        setCategories(cRes.data);
      }
    );
  }, []);

  const fetchAnalytics = useCallback(async () => {
    const res = await api.get<AnalyticsData>("/reports/analytics", {
      params: {
        location_id: locationId || undefined,
        category_id: categoryId || undefined,
      },
    });
    setAnalytics(res.data);
  }, [locationId, categoryId]);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const res = await api.get<ReportPreview>("/reports/preview", {
        params: {
          report_type: reportType,
          location_id: locationId || undefined,
          category_id: categoryId || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      });
      setPreview(res.data);
    } finally {
      setLoadingPreview(false);
    }
  }, [reportType, locationId, categoryId, dateFrom, dateTo]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    fetchPreview();
  }, [fetchPreview]);

  const handleExport = async (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ report_type: reportType, format });
    if (locationId) params.set("location_id", locationId);
    if (categoryId) params.set("category_id", categoryId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    await downloadAuthorizedFile(`/api/reports/export?${params.toString()}`, `cmrl_${reportType}.${format}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Live Nandanam Head Office IT telemetry charts and exportable asset registers (Excel, CSV, PDF)"
      />

      {/* Global Report Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Nandanam HQ Zone / Floor</label>
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All HQ Zones</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Asset Category</label>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">From Date</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">To Date</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </Card>

      {/* Analytics Charts Grid */}
      {analytics && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold">Asset Status Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.status_distribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                  >
                    {analytics.status_distribution.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || "#64748B"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold">Category-wise Asset Distribution</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.category_distribution}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-18} textAnchor="end" height={55} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0066B3" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold">HQ Zone-wise Distribution (Working vs Faulty)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.station_distribution}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="working" name="Working" stackId="a" fill="#16A34A" />
                  <Bar dataKey="faulty" name="Faulty / Repair" stackId="a" fill="#DC2626" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="mb-4 text-sm font-bold">Monthly Fault &amp; Resolution Trends</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.monthly_fault_trends}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="reported" name="Faults Reported" stroke="#DC2626" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="resolved" name="Repairs Resolved" stroke="#009E49" strokeWidth={2.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-5 lg:col-span-2">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div>
                <h3 className="text-sm font-bold">Warranty Expiry Overview</h3>
                <p className="text-xs text-slate-500">
                  Average ticket resolution time:{" "}
                  <strong>{analytics.ticket_metrics.avg_resolution_hours} hours</strong> ({analytics.ticket_metrics.resolved}{" "}
                  resolved / {analytics.ticket_metrics.total} total)
                </p>
              </div>
            </div>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.warranty_overview}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#009E49" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Report Generator & Export Table */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-bold uppercase text-slate-500">Select Report:</label>
            <Select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              className="w-72"
            >
              {REPORT_TYPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel (.xlsx)
            </Button>
            <Button size="sm" onClick={() => handleExport("pdf")}>
              <FileText className="h-3.5 w-3.5" /> PDF Report
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingPreview ? (
            <div className="p-10 text-center text-sm text-slate-500">Generating report preview...</div>
          ) : !preview || preview.rows.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No rows match the selected filters.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  {preview.headers.map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.rows.slice(0, 50).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-4 py-2.5 whitespace-nowrap">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {preview && preview.total_rows > 50 && (
          <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
            Showing first 50 of {preview.total_rows} rows. Export CSV, Excel, or PDF for the complete report.
          </div>
        )}
      </Card>
    </div>
  );
}
