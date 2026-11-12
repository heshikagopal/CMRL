import { Download, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { downloadAuthorizedFile } from "@/api/client";
import { Button, Modal } from "@/components/ui";
import type { Asset } from "@/types";

export function QRLabelModal({
  asset,
  open,
  onClose,
}: {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!asset) return null;

  const handleDownloadPng = async () => {
    await downloadAuthorizedFile(`/api/assets/${asset.asset_id}/qr?label=true`, `${asset.asset_id}-qr.png`);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="CMRL Asset QR Tag & Printable Label"
      subtitle={`Permanent Asset ID: ${asset.asset_id}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div
          id="printable-qr-label"
          className="overflow-hidden rounded-xl border-2 border-slate-300 bg-white p-5 text-slate-900 shadow-xs"
        >
          <div className="-mx-5 -mt-5 mb-4 flex h-2">
            <div className="w-1/2 bg-[#0066B3]" />
            <div className="w-1/2 bg-[#009E49]" />
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#0066B3]">
                Chennai Metro Rail Limited
              </p>
              <p className="text-xs font-semibold text-slate-600">IT Asset Identification Tag</p>
            </div>
            <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
              {asset.category.code}
            </span>
          </div>

          <div className="my-4 flex flex-col items-center justify-center">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <QRCodeSVG value={asset.qr_code_data || asset.asset_id} size={172} level="M" includeMargin={false} />
            </div>
            <p className="mt-3 font-mono text-lg font-bold tracking-wider text-slate-900">{asset.asset_id}</p>
            <p className="text-center text-xs font-medium text-slate-600">{asset.name}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
            <div>
              <span className="block text-[10px] uppercase text-slate-400">Category</span>
              <span className="font-semibold text-slate-800">{asset.category.name}</span>
            </div>
            <div>
              <span className="block text-[10px] uppercase text-slate-400">Serial No</span>
              <span className="font-mono font-semibold text-slate-800">{asset.serial_number}</span>
            </div>
          </div>
        </div>

        <div className="no-print flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleDownloadPng}>
            <Download className="h-4 w-4" />
            Download PNG
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print Asset Label
          </Button>
        </div>
      </div>
    </Modal>
  );
}
