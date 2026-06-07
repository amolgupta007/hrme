"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { assignShiftToEmployees, assignShiftToDepartment } from "@/actions/shifts";
import type { Shift } from "@/actions/shifts";
import type { Employee, Department } from "@/types";

interface Props {
  shifts: Shift[];
  employees: Employee[];
  departments: Department[];
  onClose: () => void;
}

export function AssignShiftDialog({ shifts, employees, departments, onClose }: Props) {
  const [shiftId, setShiftId] = useState(shifts.find((s) => s.is_default)?.id ?? shifts[0]?.id ?? "");
  const [scope, setScope] = useState<"employees" | "department">("employees");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState("");
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!shiftId) return toast.error("Pick a shift");
    setSaving(true);
    const args = { shift_id: shiftId, date_from: dateFrom, date_to: dateTo || null };
    const r = scope === "employees"
      ? await assignShiftToEmployees({ ...args, employee_ids: [...selected] })
      : await assignShiftToDepartment({ ...args, department_id: departmentId });
    setSaving(false);
    if (r.success) { toast.success(`Assigned ${r.data.inserted} employee(s)`); onClose(); }
    else toast.error(r.error);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl">
        <p className="text-sm font-semibold mb-3">Assign shift</p>
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Shift</span>
            <select className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              {shifts.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
              ))}
            </select>
          </label>
          <div className="flex gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={scope === "employees"} onChange={() => setScope("employees")} />Employees</label>
            <label className="inline-flex items-center gap-1.5"><input type="radio" checked={scope === "department"} onChange={() => setScope("department")} />Whole department</label>
          </div>
          {scope === "employees" ? (
            <div className="max-h-48 overflow-auto rounded-md border border-border p-2 space-y-1">
              {employees.map((e: any) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                  {e.first_name} {e.last_name}
                </label>
              ))}
            </div>
          ) : (
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">Department</span>
              <select className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">From</span>
              <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="block">
              <span className="block text-xs text-muted-foreground mb-1">To (blank = ongoing)</span>
              <input type="date" className="w-full rounded-md border border-input bg-background px-3 py-1.5" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Assign"}</Button>
        </div>
      </div>
    </div>
  );
}
