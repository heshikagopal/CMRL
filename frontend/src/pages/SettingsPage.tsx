import { useEffect, useState } from "react";
import { BellRing, CheckCircle2, Database, RefreshCw, Save, ShieldAlert } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { useLive } from "@/context/LiveContext";
import { formatDateTime } from "@/lib/utils";
import type { SystemSetting } from "@/types";

interface AuditEntry {
  id: number;
  username: string;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  created_at: string;
}

export function SettingsPage() {
  const { hasRole } = useAuth();
  const { scanAlerts } = useLive();
  const isAdmin = hasRole("ADMIN");
  const canScan = hasRole("ADMIN", "TECHNICIAN", "STORE_KEEPER");

  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [dbHealth, setDbHealth] = useState<{ status: string; database: string } | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    api.get<{ status: string; database: string }>("/health").then((r) => setDbHealth(r.data));
    api.get<SystemSetting[]>("/settings").then((r) => {
      setSettings(r.data);
      const map: Record<string, string> = {};
      r.data.forEach((s) => {
        map[s.key] = s.value;
      });
      setFormValues(map);
    });
    if (isAdmin) {
      api.get<AuditEntry[]>("/settings/audit-logs").then((r) => setAuditLogs(r.data));
    }
  }, [isAdmin]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavedMsg("");
    setErrorMsg("");
    try {
      await api.put("/settings", { settings: formValues });
      setSavedMsg("System settings saved to database.");
    } catch (err) {
      setErrorMsg(getApiErrorMessage(err, "Failed to update settings"));
    }
  };

  const handleRunAlertScan = async () => {
    await scanAlerts();
    setSavedMsg("Alert scanner executed for overdue tickets, 30-day warranty expiry, and low spare stock.");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Settings & Audit Governance"
        subtitle="Configure operational alert thresholds, notification channels, and inspect immutable audit logs"
        actions={
          canScan && (
            <Button variant="outline" size="sm" onClick={handleRunAlertScan}>
              <BellRing className="h-4 w-4" /> Run Alert Scanner
            </Button>
          )
        }
      />

      {savedMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> {savedMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{errorMsg}</div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            Platform Configuration Parameters
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            {settings.map((s) => (
              <div key={s.key} className="grid grid-cols-1 gap-2 border-b border-slate-100 pb-3 dark:border-slate-800 sm:grid-cols-2">
                <div>
                  <p className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">{s.key}</p>
                  <p className="text-[11px] text-slate-500">{s.description}</p>
                </div>
                <Input
                  disabled={!isAdmin}
                  value={formValues[s.key] ?? ""}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [s.key]: e.target.value }))}
                />
              </div>
            ))}
            {isAdmin && (
              <div className="flex justify-end">
                <Button type="submit">
                  <Save className="h-4 w-4" /> Save Settings
                </Button>
              </div>
            )}
          </form>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            <Database className="h-4 w-4 text-[#0066B3]" /> System Telemetry &amp; Prototype Notice
          </h3>
          <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-950">
            <p className="flex justify-between">
              <span className="text-slate-500">API Health:</span>
              <span className="font-bold text-emerald-600 uppercase">{dbHealth?.status || "checking"}</span>
            </p>
            <p className="mt-1.5 flex justify-between">
              <span className="text-slate-500">Database Engine:</span>
              <span className="font-mono font-bold uppercase text-[#0066B3]">{dbHealth?.database || "—"}</span>
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="flex items-center gap-1.5 font-bold">
              <ShieldAlert className="h-4 w-4" /> Enterprise Prototype Scope
            </p>
            <p className="mt-1 leading-relaxed">
              This CMRL ITAM application is an internal enterprise prototype with fictional demo data. External email/SMS relays are configurable and disabled in local mode; in-app notifications &amp; WebSocket telemetry remain active.
            </p>
          </div>
        </Card>
      </div>

      {isAdmin && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950">
            <h3 className="text-sm font-bold">Permanent System Audit Trail</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => api.get<AuditEntry[]>("/settings/audit-logs").then((r) => setAuditLogs(r.data))}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950">
                <tr>
                  <th className="px-4 py-2.5">Timestamp</th>
                  <th className="px-4 py-2.5">Actor</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entity</th>
                  <th className="px-4 py-2.5">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5 font-mono text-slate-500">{formatDateTime(l.created_at)}</td>
                    <td className="px-4 py-2.5 font-semibold">{l.username}</td>
                    <td className="px-4 py-2.5 font-mono text-[#0066B3]">{l.action}</td>
                    <td className="px-4 py-2.5 font-mono">{l.entity_id}</td>
                    <td className="px-4 py-2.5">{l.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
