import { useCallback, useEffect, useState } from "react";
import { Edit2, MapPin, Plus } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { Button, Card, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAuth } from "@/context/AuthContext";
import type { Location } from "@/types";

export function LocationsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");

  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [locType, setLocType] = useState("OFFICE");
  const [address, setAddress] = useState("MetroS HQ, Anna Salai, Nandanam, Chennai");
  const [description, setDescription] = useState("");
  const [formErr, setFormErr] = useState("");

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Location[]>("/locations", {
        params: {
          location_type: typeFilter || undefined,
        },
      });
      setLocations(res.data);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const openCreate = () => {
    setEditingLoc(null);
    setCode("");
    setName("");
    setLocType("OFFICE");
    setAddress("MetroS HQ, Anna Salai, Nandanam, Chennai");
    setDescription("");
    setFormErr("");
    setModalOpen(true);
  };

  const openEdit = (l: Location) => {
    setEditingLoc(l);
    setCode(l.location_code);
    setName(l.name);
    setLocType(l.location_type);
    setAddress(l.address || "");
    setDescription(l.description || "");
    setFormErr("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    try {
      if (editingLoc) {
        await api.put(`/locations/${editingLoc.id}`, {
          name,
          location_type: locType,
          metro_line: "NONE",
          address: address || null,
          description: description || null,
        });
      } else {
        await api.post("/locations", {
          location_code: code,
          name,
          location_type: locType,
          metro_line: "NONE",
          address: address || null,
          description: description || null,
        });
      }
      setModalOpen(false);
      fetchLocations();
    } catch (err) {
      setFormErr(getApiErrorMessage(err, "Failed to save HQ zone"));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Nandanam HQ Locations & Zones"
        subtitle="Manage floors, wings, IT helpdesk bays, central IT store, and data centre zones at CMRL Head Office (MetroS, Nandanam)"
        actions={
          isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add HQ Zone
            </Button>
          )
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All HQ Facility Types</option>
            <option value="OFFICE">Office Wings &amp; Lobby</option>
            <option value="DATA_CENTRE">Data Centre &amp; NOC</option>
            <option value="CENTRAL_STORE">Central IT Store</option>
            <option value="OTHER">IT Helpdesk &amp; Repair Lab</option>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3">Zone Code</th>
                <th className="px-4 py-3">HQ Floor / Zone Name</th>
                <th className="px-4 py-3">Facility Type</th>
                <th className="px-4 py-3 text-center">Total Assets</th>
                <th className="px-4 py-3 text-center">Working</th>
                <th className="px-4 py-3 text-center">Faulty / Repair</th>
                {isAdmin && <th className="px-4 py-3 text-right">Edit</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Loading Nandanam HQ zones...
                  </td>
                </tr>
              ) : (
                locations.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-[#0066B3] dark:text-sky-400">
                      {l.location_code}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        <MapPin className="h-3.5 w-3.5 text-[#009E49]" />
                        {l.name}
                      </div>
                      {l.address && <span className="text-[11px] text-slate-400">{l.address}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium">{l.location_type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold">{l.asset_count}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-emerald-600">{l.working_count}</td>
                    <td className="px-4 py-3 text-center font-mono font-bold text-red-600">
                      {l.faulty_count + l.under_repair_count}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(l)}>
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLoc ? `Edit HQ Zone — ${editingLoc.location_code}` : "Add Nandanam HQ Zone"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          {formErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{formErr}</div>}
          {!editingLoc && (
            <div>
              <label className="mb-1 block text-xs font-semibold">Zone Code *</label>
              <Input required value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. HQ-1F-CONF" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold">Zone / Floor Name *</label>
            <Input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 1F — Conference & Training Wing"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Facility Type</label>
            <Select value={locType} onChange={(e) => setLocType(e.target.value)}>
              <option value="OFFICE">Office Wing / Lobby</option>
              <option value="DATA_CENTRE">Data Centre / NOC</option>
              <option value="CENTRAL_STORE">Central IT Store</option>
              <option value="OTHER">IT Helpdesk / Lab</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Floor / Wing Location Note</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Description</label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save HQ Zone</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
