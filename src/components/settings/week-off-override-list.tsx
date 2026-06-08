"use client";

import * as React from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteEmployeeWeekOffOverride, type EmployeeWeekOffOverrideRow } from "@/actions/week-off";
import { WeekOffOverrideDialog } from "./week-off-override-dialog";
import type { Employee } from "@/types";

interface Props {
  overrides: EmployeeWeekOffOverrideRow[];
  employees: Employee[];
}

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ALT_LABEL: Record<string, string> = {
  none: "",
  odd_off: " · 1st+3rd Sat",
  even_off: " · 2nd+4th Sat",
};

export function WeekOffOverrideList({ overrides, employees }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  async function handleDelete(employeeId: string, name: string) {
    if (!confirm(`Remove week-off override for ${name}? They'll revert to the org policy.`)) return;
    const r = await deleteEmployeeWeekOffOverride(employeeId);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Override removed");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Per-employee week-off overrides</p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add override
        </Button>
      </div>
      {overrides.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No overrides. By default everyone follows the org week-off policy above.
          Add an override for employees on a different schedule (e.g. one 6-day worker in a 5-day org).
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {overrides.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2">
              <div className="text-sm">
                <p className="font-medium">{o.employee_name}</p>
                <p className="text-xs text-muted-foreground">
                  {o.week_type}-day · {o.off_days.map((d) => DAY_LABEL[d]).join(", ")} off{ALT_LABEL[o.alt_saturday_rule ?? "none"]} · since {o.effective_from}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(o.employee_id, o.employee_name)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <WeekOffOverrideDialog employees={employees} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
