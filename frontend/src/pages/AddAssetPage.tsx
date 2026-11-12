import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { CheckCircle2, FileText, Image as ImageIcon, QrCode } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { QRLabelModal } from "@/components/QRLabelModal";
import { Button, Card, Input, PageHeader, Select, Textarea } from "@/components/ui";
import type { Asset, Category, Department, Location, Vendor } from "@/types";

const assetFormSchema = z.object({
  name: z.string().min(2, "Asset name is required"),
  category_id: z.coerce.number().min(1, "Select a category"),
  manufacturer: z.string().min(1, "Manufacturer is required"),
  model: z.string().min(1, "Model is required"),
  serial_number: z.string().min(2, "Serial number is required"),
  purchase_date: z.string().optional(),
  purchase_cost: z.string().optional(),
  warranty_start: z.string().optional(),
  warranty_end: z.string().optional(),
  vendor_id: z.string().optional(),
  location_id: z.coerce.number().min(1, "Select current location"),
  department_id: z.string().optional(),
  assigned_to_name: z.string().optional(),
  description: z.string().optional(),
  remarks: z.string().optional(),
});

type AssetFormValues = z.infer<typeof assetFormSchema>;

export function AddAssetPage() {
  const navigate = useNavigate();

  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [apiError, setApiError] = useState("");
  const [createdAsset, setCreatedAsset] = useState<Asset | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
  });

  useEffect(() => {
    Promise.all([
      api.get<Category[]>("/master/categories"),
      api.get<Location[]>("/locations"),
      api.get<Department[]>("/master/departments"),
      api.get<Vendor[]>("/master/vendors"),
    ]).then(([c, l, d, v]) => {
      setCategories(c.data);
      setLocations(l.data);
      setDepartments(d.data);
      setVendors(v.data);
      const centralStore = l.data.find((x) => x.location_code === "HQ-2F-STR") || l.data[0];
      if (centralStore) setValue("location_id", centralStore.id);
    });
  }, [setValue]);

  const onSubmit = async (values: AssetFormValues) => {
    setApiError("");
    try {
      const payload = {
        name: values.name,
        category_id: values.category_id,
        manufacturer: values.manufacturer,
        model: values.model,
        serial_number: values.serial_number,
        purchase_date: values.purchase_date || null,
        purchase_cost: values.purchase_cost ? Number(values.purchase_cost) : null,
        warranty_start: values.warranty_start || null,
        warranty_end: values.warranty_end || null,
        vendor_id: values.vendor_id ? Number(values.vendor_id) : null,
        location_id: values.location_id,
        department_id: values.department_id ? Number(values.department_id) : null,
        assigned_to_name: values.assigned_to_name || null,
        description: values.description || null,
        remarks: values.remarks || null,
      };
      const res = await api.post<Asset>("/assets", payload);
      let assetOut = res.data;

      if (photoFile || invoiceFile) {
        const fd = new FormData();
        if (photoFile) fd.append("photo", photoFile);
        if (invoiceFile) fd.append("invoice", invoiceFile);
        const upRes = await api.post<Asset>(`/assets/${assetOut.asset_id}/attachments`, fd);
        assetOut = upRes.data;
      }

      setCreatedAsset(assetOut);
      setQrOpen(true);
    } catch (err) {
      setApiError(getApiErrorMessage(err, "Failed to register asset"));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Register New IT Asset"
        subtitle="Generates a permanent CMRL Asset ID and QR label. Initial status is automatically set to IN STORE."
      />

      {createdAsset && (
        <Card className="border-emerald-300 bg-emerald-50/70 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                  Registered Permanent Asset ID: <span className="font-mono">{createdAsset.asset_id}</span>
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300">
                  {createdAsset.name} • QR Code generated &amp; saved in IN_STORE status.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" /> View QR Label
              </Button>
              <Button size="sm" onClick={() => navigate(`/assets/${createdAsset.asset_id}`)}>
                Open Asset Dossier
              </Button>
            </div>
          </div>
        </Card>
      )}

      {apiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {apiError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            1. Device Identification &amp; Specifications
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Asset Name *
              </label>
              <Input {...register("name")} placeholder="e.g. Engineering CAD Workstation - 4F Wing" />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Asset Category *
              </label>
              <Select {...register("category_id")}>
                <option value="">Select Category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </Select>
              {errors.category_id && <p className="mt-1 text-xs text-red-600">{errors.category_id.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Serial Number *
              </label>
              <Input {...register("serial_number")} placeholder="Unique manufacturer serial no." />
              {errors.serial_number && <p className="mt-1 text-xs text-red-600">{errors.serial_number.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Manufacturer *
              </label>
              <Input {...register("manufacturer")} placeholder="e.g. Dell, Cisco, Hikvision, APC, HPE" />
              {errors.manufacturer && <p className="mt-1 text-xs text-red-600">{errors.manufacturer.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Model *</label>
              <Input {...register("model")} placeholder="e.g. Latitude 5440 / Catalyst 9200L" />
              {errors.model && <p className="mt-1 text-xs text-red-600">{errors.model.message}</p>}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            2. Procurement &amp; Warranty Details
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Vendor</label>
              <Select {...register("vendor_id")}>
                <option value="">Select Vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Purchase Date
              </label>
              <Input type="date" {...register("purchase_date")} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Purchase Cost (INR)
              </label>
              <Input type="number" step="0.01" {...register("purchase_cost")} placeholder="e.g. 92000" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Warranty Start Date
              </label>
              <Input type="date" {...register("warranty_start")} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Warranty End Date
              </label>
              <Input type="date" {...register("warranty_end")} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
            3. Location, Ownership &amp; Attachments
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Initial Location *
              </label>
              <Select {...register("location_id")}>
                <option value="">Select Location...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.location_code})
                  </option>
                ))}
              </Select>
              {errors.location_id && <p className="mt-1 text-xs text-red-600">{errors.location_id.message}</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Department</label>
              <Select {...register("department_id")}>
                <option value="">Select Department...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Assigned Employee / Custodian
              </label>
              <Input {...register("assigned_to_name")} placeholder="Optional until issued" />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Asset Description
              </label>
              <Textarea rows={2} {...register("description")} placeholder="Hardware specs, rack position, IP/host notes..." />
            </div>

            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Remarks</label>
              <Input {...register("remarks")} placeholder="Receiving inspection or PO reference notes" />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <ImageIcon className="h-3.5 w-3.5" /> Asset Photograph
              </label>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                <FileText className="h-3.5 w-3.5" /> Invoice Attachment
              </label>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700"
              />
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/assets")}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Generating Asset ID & QR..." : "Register Asset & Generate QR"}
          </Button>
        </div>
      </form>

      <QRLabelModal asset={createdAsset} open={qrOpen} onClose={() => setQrOpen(false)} />
    </div>
  );
}
