import { getCurrentUser, isAdmin, isManagerOrAbove } from "@/lib/current-user";
import { redirect } from "next/navigation";
import { getTodayStatus, listAttendance, getTeamTodayAttendance, getAttendanceSettings } from "@/actions/attendance";
import { listEmployees } from "@/actions/employees";
import { AttendanceClient } from "@/components/attendance/attendance-client";

export default async function AttendancePage() {
  const user = await getCurrentUser();

  if (!user?.attendanceEnabled) {
    redirect("/dashboard/settings");
  }

  const isManager = isManagerOrAbove(user.role);
  const isAdminUser = isAdmin(user.role);

  const [todayResult, historyResult, teamResult, employeesResult, settingsResult] = await Promise.all([
    getTodayStatus(),
    listAttendance({ from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) }),
    isManager ? getTeamTodayAttendance() : Promise.resolve(null),
    isManager ? listEmployees() : Promise.resolve(null),
    isAdminUser ? getAttendanceSettings() : Promise.resolve(null),
  ]);

  const today = todayResult.success ? todayResult.data : null;
  const history = historyResult.success ? historyResult.data : [];
  const team = teamResult?.success ? teamResult.data : null;
  const employees = employeesResult?.success ? employeesResult.data : [];
  const attendanceSettings = settingsResult?.success ? settingsResult.data : null;

  return (
    <AttendanceClient
      today={today}
      history={history}
      team={team}
      employees={employees ?? []}
      isManager={isManager}
      isAdmin={isAdminUser}
      attendanceSettings={attendanceSettings}
      attendancePayrollEnabled={user.attendancePayrollEnabled}
    />
  );
}
