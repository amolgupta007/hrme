"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { Employee, Department } from "@/types";
import { AssignShiftDialog } from "./assign-shift-dialog";

export function ShiftAssignmentsCard({ assignments, shifts, employees, departments }: {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  employees: Employee[];
  departments: Department[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold">Shift Assignments</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={shifts.length === 0}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Assign shift
        </Button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assignments yet. Pick a shift and assign employees or a whole department.</p>
      ) : (
        <ul className="divide-y divide-border">
          {assignments.map((a) => (
            <li key={a.id} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{a.employee_name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{a.shift_name ?? "—"} · {a.date_from}{a.date_to ? ` → ${a.date_to}` : " → ongoing"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <AssignShiftDialog shifts={shifts} employees={employees} departments={departments} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
