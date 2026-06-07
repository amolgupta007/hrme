"use client";

import { WorkingHoursCard } from "./working-hours-card";
import { ShiftMasterCard } from "./shift-master-card";
import { ShiftAssignmentsCard } from "./shift-assignments-card";
import { WeekOffCard } from "./week-off-card";
import type { AttendanceSettings } from "@/actions/attendance";
import type { Shift, ShiftAssignment } from "@/actions/shifts";
import type { WeekOffPolicy } from "@/lib/attendance/week-off";
import type { Employee, Department } from "@/types";

interface Props {
  attendanceSettings: AttendanceSettings | null;
  shifts: Shift[];
  assignments: ShiftAssignment[];
  weekOffPolicy: WeekOffPolicy | null;
  employees: Employee[];
  departments: Department[];
}

export function AttendanceSection({ attendanceSettings, shifts, assignments, weekOffPolicy, employees, departments }: Props) {
  return (
    <div className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Attendance</h2>
      <p className="text-sm text-muted-foreground">
        Configure shifts, assign employees to shifts, set the org-wide week-off policy, and
        manage the fallback working hours used when no shift is assigned.
      </p>
      {attendanceSettings && <WorkingHoursCard settings={attendanceSettings} />}
      <ShiftMasterCard shifts={shifts} />
      <ShiftAssignmentsCard assignments={assignments} shifts={shifts} employees={employees} departments={departments} />
      <WeekOffCard initial={weekOffPolicy} />
    </div>
  );
}
