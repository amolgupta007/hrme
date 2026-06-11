"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DestructiveDialog } from "@/components/ui/destructive-dialog";
import { deleteShiftAssignment } from "@/actions/shifts";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { Employee, Department } from "@/types";
import { AssignShiftDialog } from "./assign-shift-dialog";

export function ShiftAssignmentsCard({ assignments, shifts, employees, departments }: {
  assignments: ShiftAssignment[];
  shifts: Shift[];
  employees: Employee[];
  departments: Department[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShiftAssignment | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const a = pendingDelete;
    setDeletingId(a.id);
    const r = await deleteShiftAssignment(a.id);
    setDeletingId(null);
    setPendingDelete(null);
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Assignment removed");
    router.refresh();
  }

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
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPendingDelete(a)}
                disabled={deletingId === a.id}
                title="Delete assignment"
                aria-label={`Delete ${a.shift_name ?? "shift"} assignment for ${a.employee_name ?? "employee"}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <AssignShiftDialog shifts={shifts} employees={employees} departments={departments} onClose={() => setOpen(false)} />
      )}

      <DestructiveDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={
          pendingDelete
            ? `Delete the ${pendingDelete.shift_name ?? "shift"} assignment for ${pendingDelete.employee_name ?? "this employee"}?`
            : ""
        }
        description="They'll have no assigned shift unless another assignment covers the date range. Historical attendance is preserved."
        confirmLabel="Delete assignment"
        loading={deletingId !== null}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
