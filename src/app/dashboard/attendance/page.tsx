import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { redirect } from "next/navigation";
import { getTodayStatus, listAttendance, getTeamTodayAttendance } from "@/actions/attendance";
import { listEmployees } from "@/actions/employees";
import { getActiveShiftForEmployee, getRosterGrid } from "@/actions/shifts";
import { getWeekOffPolicy, listAllWeekOffOverrides, listAllDepartmentWeekOffOverrides } from "@/actions/week-off";
import { resolveEffectiveWeekOff, type WeekOffPolicy } from "@/lib/attendance/week-off";
import { getOvertimeRecords, getOvertimeSettings } from "@/actions/overtime";
import { DEFAULT_OT_SETTINGS } from "@/lib/attendance/overtime-types";
import { AttendanceClient } from "@/components/attendance/attendance-client";

function defaultWeekRange(): { from: string; to: string } {
  // IST today. Find this week's Monday (ISO Monday=1 ... Sunday=7).
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const dayOfWeek = now.getUTCDay() || 7; // 0 = Sunday → 7
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export default async function AttendancePage() {
  const user = await getCurrentUser();

  if (!user?.attendanceEnabled) {
    redirect("/dashboard/settings");
  }

  const isManager = isManagerOrAbove(user.role);
  const isAdminUser = isAdmin(user.role);

  const istToday = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const activeShift = user.employeeId ? await getActiveShiftForEmployee(user.employeeId, istToday) : null;

  const [todayResult, historyResult, teamResult, employeesResult] = await Promise.all([
    getTodayStatus(),
    listAttendance({ from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }),
    isManager ? getTeamTodayAttendance() : Promise.resolve(null),
    isManager ? listEmployees() : Promise.resolve(null),
  ]);

  const today = todayResult.success ? todayResult.data : null;
  const history = historyResult.success ? historyResult.data : [];
  const team = teamResult?.success ? teamResult.data : null;
  const employees = employeesResult?.success ? employeesResult.data : [];

  const { from: rosterFrom, to: rosterTo } = defaultWeekRange();
  const [rosterResult, weekOffResult, empOverridesResult, deptOverridesResult] = await Promise.all([
    isManager ? getRosterGrid({ from: rosterFrom, to: rosterTo }) : Promise.resolve(null),
    getWeekOffPolicy(),
    isManager ? listAllWeekOffOverrides() : Promise.resolve(null),
    isManager ? listAllDepartmentWeekOffOverrides() : Promise.resolve(null),
  ]);
  const roster = rosterResult?.success ? rosterResult.data : null;
  const weekOff = weekOffResult?.success ? weekOffResult.data : null;

  // Resolve each employee's effective week-off (employee override > department
  // override > org policy) so the roster conflict check honours overrides.
  const empOverrides = empOverridesResult?.success ? empOverridesResult.data : [];
  const deptOverrides = deptOverridesResult?.success ? deptOverridesResult.data : [];
  const empOvMap = new Map(empOverrides.map((o) => [o.employee_id, { week_type: o.week_type, off_days: o.off_days, alt_saturday_rule: o.alt_saturday_rule }]));
  const deptOvMap = new Map(deptOverrides.map((o) => [o.department_id, { week_type: o.week_type, off_days: o.off_days, alt_saturday_rule: o.alt_saturday_rule }]));
  const basePolicy: WeekOffPolicy = weekOff ?? { week_type: 6, off_days: [] };
  const weekOffByEmployee: Record<string, WeekOffPolicy> = {};
  for (const e of employees ?? []) {
    const eo = empOvMap.get(e.id);
    const dOv = e.department_id ? deptOvMap.get(e.department_id) : undefined;
    if (eo || dOv) weekOffByEmployee[e.id] = resolveEffectiveWeekOff(basePolicy, dOv, eo);
  }

  const [otRecordsResult, otSettingsResult] = await Promise.all([
    isAdminUser ? getOvertimeRecords() : Promise.resolve(null),
    getOvertimeSettings(),
  ]);
  const overtimeRecords = otRecordsResult?.success ? otRecordsResult.data : [];
  const overtimeSettings = otSettingsResult?.success ? otSettingsResult.data : DEFAULT_OT_SETTINGS;

  return (
    <AttendanceClient
      today={today}
      history={history}
      team={team}
      employees={employees ?? []}
      isManager={isManager}
      isAdmin={isAdminUser}
      attendancePayrollEnabled={user.attendancePayrollEnabled}
      activeShift={activeShift}
      roster={roster}
      weekOff={weekOff}
      weekOffByEmployee={weekOffByEmployee}
      rosterRange={{ from: rosterFrom, to: rosterTo }}
      overtimeRecords={overtimeRecords}
      overtimeSettings={overtimeSettings}
    />
  );
}
