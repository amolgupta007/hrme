"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import {
  deleteEmployeeWeekOffOverride,
  deleteDepartmentWeekOffOverride,
  type EmployeeWeekOffOverrideRow,
  type DepartmentWeekOffOverrideRow,
} from "@/actions/week-off";
import { WeekOffOverrideDialog } from "./week-off-override-dialog";
import type { Employee, Department } from "@/types";

interface Props {
  overrides: EmployeeWeekOffOverrideRow[];
  departmentOverrides?: DepartmentWeekOffOverrideRow[];
  employees: Employee[];
  departments?: Department[];
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALT_LABEL: Record<string, string> = {
  none: "",
  odd_off: " · 1st+3rd Sat",
  even_off: " · 2nd+4th Sat",
};

function describe(o: { week_type: number; off_days: number[]; alt_saturday_rule?: string | null; effective_from: string }) {
  return `${o.week_type}-day · ${o.off_days.map((d) => DAY_LABEL[d]).join(", ")} off${ALT_LABEL[o.alt_saturday_rule ?? "none"]} · since ${o.effective_from}`;
}

type PendingDelete =
  | { kind: "employee"; row: EmployeeWeekOffOverrideRow }
  | { kind: "department"; row: DepartmentWeekOffOverrideRow };

export function WeekOffOverrideList({ overrides, departmentOverrides = [], employees, departments = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<PendingDelete | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const r = pendingDelete.kind === "employee"
      ? await deleteEmployeeWeekOffOverride(pendingDelete.row.employee_id)
      : await deleteDepartmentWeekOffOverride(pendingDelete.row.department_id);
    setDeleting(false);
    setPendingDelete(null);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Override removed");
    router.refresh();
  }

  const isEmpty = overrides.length === 0 && departmentOverrides.length === 0;
  const deleteTitle = pendingDelete
    ? pendingDelete.kind === "employee"
      ? `Remove week-off override for ${pendingDelete.row.employee_name}?`
      : `Remove week-off override for the ${pendingDelete.row.department_name} department?`
    : "";

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Week-off overrides</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add override
        </Button>
      </div>

      {isEmpty ? (
        <p className="text-xs text-muted-foreground">
          No overrides. By default everyone follows the org week-off policy above.
          Add an override for a whole department, or for a single employee, on a different schedule
          (e.g. a 6-day Sales team in a 5-day org). Precedence: employee override &gt; department override &gt; org policy.
        </p>
      ) : (
        <div className="space-y-3">
          {departmentOverrides.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">By department</p>
              <ul className="divide-y divide-border">
                {departmentOverrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <div className="text-sm">
                      <p className="font-medium flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />{o.department_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{describe(o)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDelete({ kind: "department", row: o })}
                      aria-label={`Remove week-off override for ${o.department_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overrides.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">By employee</p>
              <ul className="divide-y divide-border">
                {overrides.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2">
                    <div className="text-sm">
                      <p className="font-medium flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />{o.employee_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{describe(o)}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPendingDelete({ kind: "employee", row: o })}
                      aria-label={`Remove week-off override for ${o.employee_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {open && (
        <WeekOffOverrideDialog employees={employees} departments={departments} onClose={() => setOpen(false)} />
      )}

      <DestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={deleteTitle}
        description="They'll revert to the level below (department override or org policy). Past attendance and rosters are unaffected."
        confirmLabel="Remove override"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
