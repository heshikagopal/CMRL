import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Html5Qrcode } from "html5-qrcode";
import {
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  CameraOff,
  CheckCircle2,
  Eye,
  History,
  Package,
  QrCode,
  Search,
  Upload,
} from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { AssetStatusBadge } from "@/components/StatusBadge";
import { Button, Card, Input, PageHeader } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import { extractAssetIdFromScan } from "@/lib/utils";
import type { Asset } from "@/types";

export function QRScannerPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canFault = hasRole("ADMIN", "TECHNICIAN", "STORE_KEEPER");
  const canMoveOrStore = hasRole("ADMIN", "STORE_KEEPER");

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [resolvedAsset, setResolvedAsset] = useState<Asset | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  const resolveScannedPayload = async (rawText: string) => {
    const extracted = extractAssetIdFromScan(rawText);
    setManualCode(extracted);
    setScanError("");
    setLookupLoading(true);
    try {
      const res = await api.get<Asset>(`/assets/${encodeURIComponent(extracted)}`);
      setResolvedAsset(res.data);
    } catch (err) {
      setResolvedAsset(null);
      setScanError(getApiErrorMessage(err, `Asset '${extracted}' not found in CMRL register.`));
    } finally {
      setLookupLoading(false);
    }
  };

  const startCamera = async () => {
    setScanError("");
    try {
      const html5Qr = new Html5Qrcode("qr-reader-region");
      scannerRef.current = html5Qr;
      await html5Qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopCamera();
          resolveScannedPayload(decodedText);
        },
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setScanError(
        "Camera permission denied or no camera device detected. You can upload a QR image or enter the Asset ID manually below."
      );
    }
  };

  const stopCamera = async () => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // ignore stop failure
      }
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError("");
    try {
      const qr = new Html5Qrcode("qr-file-temp");
      const result = await qr.scanFile(file, true);
      qr.clear();
      resolveScannedPayload(result);
    } catch {
      setScanError("Could not decode a valid CMRL QR code from the selected image.");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="QR Code Scanner & Asset Quick Lookup"
        subtitle="Scan a CMRL asset QR label via device camera, upload a QR image, or enter an Asset ID"
      />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Camera & Upload Scanner */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Camera className="h-4 w-4 text-[#0066B3]" /> Live Camera Scanner
            </h3>
            {scanning ? (
              <Button variant="danger" size="sm" onClick={stopCamera}>
                <CameraOff className="h-3.5 w-3.5" /> Stop Camera
              </Button>
            ) : (
              <Button size="sm" onClick={startCamera}>
                <Camera className="h-3.5 w-3.5" /> Start Camera Scan
              </Button>
            )}
          </div>

          <div
            id="qr-reader-region"
            className="flex min-h-60 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-950"
          >
            {!scanning && (
              <div className="p-6 text-center text-xs text-slate-500">
                <QrCode className="mx-auto mb-2 h-10 w-10 text-slate-400" />
                Click <strong>Start Camera Scan</strong> and point at a CMRL IT Asset QR Label.
              </div>
            )}
          </div>
          <div id="qr-file-temp" className="hidden" />

          <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Upload className="h-3.5 w-3.5" /> Or Scan QR Code from Image File
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileScan}
              className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700"
            />
          </div>
        </Card>

        {/* Manual Entry & Scanned Quick Actions */}
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Search className="h-4 w-4 text-[#009E49]" /> Direct Asset ID Verification
          </h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (manualCode.trim()) resolveScannedPayload(manualCode);
            }}
            className="flex gap-2"
          >
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="e.g. CMRL-IT-SW-0002"
              className="font-mono"
            />
            <Button type="submit" disabled={lookupLoading}>
              {lookupLoading ? "..." : "Lookup"}
            </Button>
          </form>

          {scanError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {scanError}
            </div>
          )}

          {resolvedAsset && (
            <div className="mt-5 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified CMRL Asset
                  </span>
                  <h4 className="mt-1 font-mono text-base font-bold text-[#0066B3] dark:text-sky-400">
                    {resolvedAsset.asset_id}
                  </h4>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{resolvedAsset.name}</p>
                </div>
                <AssetStatusBadge status={resolvedAsset.status} />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                <div>
                  <span className="block text-[10px] uppercase text-slate-400">Location</span>
                  <strong>{resolvedAsset.location.name}</strong>
                </div>
                <div>
                  <span className="block text-[10px] uppercase text-slate-400">Custodian</span>
                  <strong>{resolvedAsset.assigned_to_name || "In Store"}</strong>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <Button size="sm" onClick={() => navigate(`/assets/${resolvedAsset.asset_id}`)}>
                  <Eye className="h-3.5 w-3.5" /> View Asset
                </Button>
                <Link to={`/assets/${resolvedAsset.asset_id}`}>
                  <Button variant="outline" size="sm" className="w-full">
                    <History className="h-3.5 w-3.5" /> View History
                  </Button>
                </Link>
                {canFault && (
                  <Link to={`/maintenance?asset=${resolvedAsset.asset_id}`}>
                    <Button variant="danger" size="sm" className="w-full">
                      <AlertTriangle className="h-3.5 w-3.5" /> Report Fault
                    </Button>
                  </Link>
                )}
                {canMoveOrStore && (
                  <Link to={`/movements?asset=${resolvedAsset.asset_id}`}>
                    <Button variant="secondary" size="sm" className="w-full">
                      <ArrowLeftRight className="h-3.5 w-3.5" /> Move / Issue
                    </Button>
                  </Link>
                )}
                {canMoveOrStore && (
                  <Link to={`/inventory?asset=${resolvedAsset.asset_id}`} className="col-span-2">
                    <Button variant="outline" size="sm" className="w-full">
                      <Package className="h-3.5 w-3.5" /> Store Issue / Return
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
