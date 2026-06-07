import { isWeekOff, type WeekOffPolicy } from "./week-off";

export type Conflict = {
  type: "double_assigned" | "week_off" | "inactive_shift";
  message: string;
};

export type TargetAssignment = {
  employee_id: string;
  date: string; // YYYY-MM-DD
  shift: { id: string; name: string; active: boolean };
};

export type ExistingAssignment = {
  id: string;
  employee_id: string;
  shift_id: string;
  shift_name?: string;
  date_from: string;
  date_to: string | null;
};

function dateInRange(date: string, from: string, to: string | null): boolean {
  if (date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function detectAssignmentConflicts(
  target: TargetAssignment,
  existing: ExistingAssignment[],
  weekOff: WeekOffPolicy
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!target.shift.active) {
    conflicts.push({ type: "inactive_shift", message: `${target.shift.name} is inactive — historical only` });
  }

  const overlaps = existing.filter(
    (e) => e.employee_id === target.employee_id && dateInRange(target.date, e.date_from, e.date_to)
  );
  if (overlaps.length > 0) {
    const names = overlaps.map((o) => o.shift_name ?? "another shift").join(", ");
    conflicts.push({ type: "double_assigned", message: `Already assigned: ${names}` });
  }

  if (isWeekOff(target.date, weekOff)) {
    conflicts.push({ type: "week_off", message: `${target.date} is a week-off day` });
  }

  return conflicts;
}
