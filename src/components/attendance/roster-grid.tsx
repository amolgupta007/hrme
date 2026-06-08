"use client";
import * as React from "react";
import { DndContext, useSensors, useSensor, PointerSensor, TouchSensor, KeyboardSensor, type DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { assignShiftToCell, setAssignmentType, type RosterGrid as Grid } from "@/actions/shifts";
import { detectAssignmentConflicts, type ExistingAssignment } from "@/lib/attendance/conflict-detection";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
import { ShiftPalette } from "./shift-palette";
import { RosterCell } from "./roster-cell";
import { RosterWeekNav } from "./roster-week-nav";

interface Props {
  initial: Grid;
  weekOff: WeekOffPolicy | null;
  from: string;
  to: string;
}

export function RosterGrid({ initial, weekOff, from, to }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const shift = (event.active.data.current as any)?.shift;
    const { employee_id, date } = (event.over.data.current as any) ?? {};
    if (!shift || !employee_id || !date) return;
    setBusy(true);

    // Soft-warn for conflicts — always run; pass a safe fallback when no week-off policy exists.
    const existing: ExistingAssignment[] = initial.rows
      .find((r) => r.employee_id === employee_id)
      ?.cells
      .flatMap((c) =>
        c.assignment_id
          ? [{
              id: c.assignment_id,
              employee_id,
              shift_id: c.shift_id!,
              shift_name: c.shift_name ?? "",
              date_from: c.date,
              date_to: c.date,
            }]
          : []
      ) ?? [];
    const effectiveWeekOff = weekOff ?? { week_type: 6 as const, off_days: [] };
    const conflicts = detectAssignmentConflicts({ employee_id, date, shift }, existing, effectiveWeekOff);
    conflicts.forEach((c) => toast.warning(c.message));

    const r = await assignShiftToCell({ employee_id, shift_id: shift.id, date, type: "fixed" });
    setBusy(false);
    if (!r.success) { toast.error(r.error); return; }
    toast.success(`${shift.name} assigned`);
    router.refresh();
  }

  async function handleCellClick(assignmentId: string) {
    // For Phase 2, click on a rotational cell to promote to fixed.
    const cell = initial.rows.flatMap((r) => r.cells).find((c) => c.assignment_id === assignmentId);
    if (!cell || cell.type === "fixed") return;
    const r = await setAssignmentType(assignmentId, "fixed");
    if (!r.success) { toast.error(r.error); return; }
    toast.success("Promoted to fixed");
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-[280px_1fr] gap-4">
        <ShiftPalette shifts={initial.shifts} />
        <div className="space-y-3">
          <RosterWeekNav from={from} to={to} onChange={(f, t) => router.push(`/dashboard/attendance?tab=roster&from=${f}&to=${t}`)} />
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-3 py-2 border-r border-border min-w-[180px]">Employee</th>
                  {initial.days.map((d) => (
                    <th key={d} className="text-center px-2 py-2 border-r border-border min-w-[90px]">
                      <div className="font-medium">{new Date(`${d}T00:00:00.000Z`).toLocaleDateString("en-IN", { weekday: "short" })}</div>
                      <div className="text-[10px] text-muted-foreground">{d.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {initial.rows.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 border-r border-border align-middle">
                      <div className="font-medium">{row.employee_name}</div>
                      {row.department && <div className="text-[10px] text-muted-foreground">{row.department}</div>}
                    </td>
                    {row.cells.map((c, idx) => (
                      <RosterCell key={`${row.employee_id}-${idx}`} cell={c} employeeId={row.employee_id} onClickAssignment={handleCellClick} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {initial.rows.length === 0 && <p className="text-sm text-muted-foreground">No employees in scope for this week.</p>}
        </div>
      </div>
    </DndContext>
  );
}
