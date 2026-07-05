import { describe, it, expect } from "vitest";
import {
  detectAssignmentConflicts,
  type Conflict,
  type TargetAssignment,
  type ExistingAssignment,
} from "@/lib/attendance/conflict-detection";

const morning = { id: "s1", name: "Morning", active: true };
const inactive = { id: "s2", name: "Old Shift", active: false };
const weekOff = { week_type: 6 as const, off_days: [0] }; // Sundays off

describe("detectAssignmentConflicts", () => {
  it("returns no conflicts for a clean weekday assignment", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: morning }; // Monday
    expect(detectAssignmentConflicts(target, [], weekOff)).toEqual([]);
  });

  it("flags double_assigned when an existing assignment overlaps the same date", () => {
    const existing: ExistingAssignment[] = [
      { id: "a1", employee_id: "e1", shift_id: "sX", shift_name: "Evening", date_from: "2026-06-01", date_to: null },
    ];
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: morning };
    const conflicts = detectAssignmentConflicts(target, existing, weekOff);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("double_assigned");
  });

  it("flags week_off when the date falls on an org week-off day", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-07", shift: morning }; // Sunday
    const conflicts = detectAssignmentConflicts(target, [], weekOff);
    expect(conflicts.some((c) => c.type === "week_off")).toBe(true);
  });

  it("flags inactive_shift when the shift is not active", () => {
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-08", shift: inactive };
    const conflicts = detectAssignmentConflicts(target, [], weekOff);
    expect(conflicts.some((c) => c.type === "inactive_shift")).toBe(true);
  });

  it("accumulates multiple conflicts simultaneously", () => {
    const existing: ExistingAssignment[] = [
      { id: "a1", employee_id: "e1", shift_id: "sX", shift_name: "Evening", date_from: "2026-06-01", date_to: null },
    ];
    const target: TargetAssignment = { employee_id: "e1", date: "2026-06-07", shift: inactive }; // Sun + double + inactive
    const conflicts = detectAssignmentConflicts(target, existing, weekOff);
    expect(conflicts.map((c) => c.type).sort()).toEqual(["double_assigned", "inactive_shift", "week_off"]);
  });
});
