"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  upsertEmployeeWeekOffOverride,
  upsertDepartmentWeekOffOverride,
} from "@/actions/week-off";
import { WEEK_DAYS, type WeekOffOverride } from "@/lib/attendance/week-off";
import type { Employee, Department } from "@/types";

type Scope = "employee" | "department";

interface Props {
  employees: Employee[];
  departments?: Department[];
  /** Force a single scope + prefilled target (e.g. re-editing a row); hides the scope toggle. */
  initialScope?: Scope;
  initialEmployeeId?: string;
  initialDepartmentId?: string;
  initial?: WeekOffOverride | null;
  onClose: () => void;
}

export function WeekOffOverrideDialog({
  employees,
  departments = [],
  initialScope,
  initialEmployeeId,
  initialDepartmentId,
  initial,
  onClose,
}: Props) {
  const router = useRouter();
  const canDepartment = departments.length > 0;
  const [scope, setScope] = React.useState<Scope>(
    initialScope ?? (initialDepartmentId ? "department" : "employee")
  );
  const [employeeId, setEmployeeId] = React.useState(initialEmployeeId ?? employees[0]?.id ?? "");
  const [departmentId, setDepartmentId] = React.useState(initialDepartmentId ?? departments[0]?.id ?? "");
  const [weekType, setWeekType] = React.useState<5 | 6>(initial?.week_type ?? 6);
  const [offDays, setOffDays] = React.useState<number[]>(initial?.off_days ?? [0]);
  const [altRule, setAltRule] = React.useState<"none" | "odd_off" | "even_off">(initial?.alt_saturday_rule ?? "none");
  const [effectiveFrom, setEffectiveFrom] = React.useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = React.useState(false);

  const lockScope = !!initialScope || !!initialEmployeeId || !!initialDepartmentId;

  function toggleDay(d: number) {
    setOffDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  async function handleSave() {
    if (scope === "employee" && !employeeId) { toast.error("Pick an employee"); return; }
    if (scope === "department" && !departmentId) { toast.error("Pick a department"); return; }
    const expected = weekType === 5 ? 2 : 1;
    if (offDays.length !== expected) {
      toast.error(weekType === 5 ? "Pick exactly 2 off days" : "Pick exactly 1 off day");
      return;
    }
    setSaving(true);
    const r = scope === "employee"
      ? await upsertEmployeeWeekOffOverride({
          employee_id: employeeId,
          week_type: weekType,
          off_days: offDays,
          alt_saturday_rule: altRule,
          effective_from: effectiveFrom,
        })
      : await upsertDepartmentWeekOffOverride({
          department_id: departmentId,
          week_type: weekType,
          off_days: offDays,
          alt_saturday_rule: altRule,
          effective_from: effectiveFrom,
        });
    setSaving(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Override saved");
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-xl space-y-3">
        <p className="text-sm font-semibold">Week-off override</p>

        {canDepartment && !lockScope && (
          <div className="flex gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={scope === "employee"} onChange={() => setScope("employee")} />
              Employee
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={scope === "department"} onChange={() => setScope("department")} />
              Whole department
            </label>
          </div>
        )}

        {scope === "employee" ? (
          <label className="block text-sm">
            <span className="block text-xs text-muted-foreground mb-1">Employee</span>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={!!initialEmployeeId}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5"
            >
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block text-sm">
            <span className="block text-xs text-muted-foreground mb-1">Department</span>
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              disabled={!!initialDepartmentId}
              className="w-full rounded-md border border-input bg-background px-3 py-1.5"
            >
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Applies to everyone in this department, unless they have their own employee override.
            </span>
          </label>
        )}

        <div className="flex gap-3 text-sm">
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={weekType === 5} onChange={() => { setWeekType(5); setOffDays([0, 6]); }} />
            5-day week
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input type="radio" checked={weekType === 6} onChange={() => { setWeekType(6); setOffDays([0]); }} />
            6-day week
          </label>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {WEEK_DAYS.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => toggleDay(d.value)}
              className={`rounded-full px-3 py-1 border ${offDays.includes(d.value) ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-xs font-medium">Alternate Saturdays</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={altRule === "none"} onChange={() => setAltRule("none")} />None
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={altRule === "odd_off"} onChange={() => setAltRule("odd_off")} />1st + 3rd
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" checked={altRule === "even_off"} onChange={() => setAltRule("even_off")} />2nd + 4th
            </label>
          </div>
        </div>
        <label className="block text-sm">
          <span className="block text-xs text-muted-foreground mb-1">Effective from</span>
          <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-1.5" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save override"}</Button>
        </div>
      </div>
    </div>
  );
}
