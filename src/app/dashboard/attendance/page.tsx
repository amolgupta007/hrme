import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { redirect } from "next/navigation";
import { getTodayStatus, listAttendance, getTeamTodayAttendance } from "@/actions/attendance";
import { listEmployees } from "@/actions/employees";
import { getActiveShiftForEmployee, getRosterGrid } from "@/actions/shifts";
import { getWeekOffPolicy } from "@/actions/week-off";
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
  const [rosterResult, weekOffResult] = await Promise.all([
    isManager ? getRosterGrid({ from: rosterFrom, to: rosterTo }) : Promise.resolve(null),
    getWeekOffPolicy(),
  ]);
  const roster = rosterResult?.success ? rosterResult.data : null;
  const weekOff = weekOffResult?.success ? weekOffResult.data : null;

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
      rosterRange={{ from: rosterFrom, to: rosterTo }}
      overtimeRecords={overtimeRecords}
      overtimeSettings={overtimeSettings}
    />
  );
}
