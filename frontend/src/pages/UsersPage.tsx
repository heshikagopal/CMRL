import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { api, getApiErrorMessage } from "@/api/client";
import { Button, Card, Input, Modal, PageHeader, Select } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { Department, Location, RoleSummary, User } from "@/types";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [formErr, setFormErr] = useState("");

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, dRes, lRes] = await Promise.all([
        api.get<User[]>("/users"),
        api.get<RoleSummary[]>("/master/roles"),
        api.get<Department[]>("/master/departments"),
        api.get<Location[]>("/locations"),
      ]);
      setUsers(uRes.data);
      setRoles(rRes.data);
      setDepartments(dRes.data);
      setLocations(lRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => {
    setEditing(null);
    setEmployeeId("");
    setFullName("");
    setUsername("");
    setEmail("");
    setPhone("");
    setPassword("");
    setRoleId(roles[0] ? String(roles[0].id) : "");
    setDepartmentId("");
    setLocationId("");
    setIsActive(true);
    setFormErr("");
    setModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEmployeeId(u.employee_id);
    setFullName(u.full_name);
    setUsername(u.username);
    setEmail(u.email);
    setPhone(u.phone || "");
    setPassword("");
    setRoleId(String(u.role.id));
    setDepartmentId(u.department ? String(u.department.id) : "");
    setLocationId(u.location ? String(u.location.id) : "");
    setIsActive(u.is_active);
    setFormErr("");
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    try {
      if (editing) {
        await api.put(`/users/${editing.id}`, {
          full_name: fullName,
          email,
          phone: phone || null,
          role_id: Number(roleId),
          department_id: departmentId ? Number(departmentId) : null,
          location_id: locationId ? Number(locationId) : null,
          is_active: isActive,
          password: password || undefined,
        });
      } else {
        await api.post("/users", {
          employee_id: employeeId,
          full_name: fullName,
          username,
          email,
          phone: phone || null,
          password,
          role_id: Number(roleId),
          department_id: departmentId ? Number(departmentId) : null,
          location_id: locationId ? Number(locationId) : null,
          is_active: isActive,
        });
      }
      setModalOpen(false);
      fetchUsers();
    } catch (err) {
      setFormErr(getApiErrorMessage(err, "Failed to save user"));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="User & Role Management"
        subtitle="Administer employee accounts, role assignments (ADMIN, TECHNICIAN, STORE_KEEPER, VIEWER), and access status"
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Employee Account
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3">Employee ID</th>
                <th className="px-4 py-3">Name &amp; Contact</th>
                <th className="px-4 py-3">Username</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Department / HQ Zone</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    Loading users...
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-mono font-bold text-[#0066B3] dark:text-sky-400">
                      {u.employee_id}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{u.full_name}</p>
                      <p className="text-[11px] text-slate-400">{u.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono">{u.username}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-[#0066B3] dark:bg-slate-800 dark:text-sky-300">
                        <ShieldCheck className="h-3 w-3" /> {u.role.name}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span>{u.department?.name || "—"}</span>
                      <span className="block text-[11px] text-slate-400">{u.location?.name || "Nandanam HQ"}</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <UserCheck className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 font-semibold text-red-700 dark:bg-red-950/60 dark:text-red-300">
                          <UserX className="h-3 w-3" /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDateTime(u.last_login_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
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
        title={editing ? `Edit Account — ${editing.username}` : "Create Employee Account"}
      >
        <form onSubmit={handleSave} className="space-y-3">
          {formErr && <div className="rounded bg-red-50 p-2.5 text-xs text-red-700">{formErr}</div>}
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold">Employee ID *</label>
                <Input required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="CMRL-EMP-1201" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold">Username *</label>
                <Input required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="jdoe" />
              </div>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold">Full Name *</label>
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Email *</label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold">Role *</label>
              <Select required value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Department</label>
              <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">HQ Floor / Zone</label>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">All</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">
              {editing ? "Reset Password (leave blank to keep current)" : "Password *"}
            </label>
            <Input
              type="password"
              required={!editing}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 6 characters"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Account Active
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save User</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
