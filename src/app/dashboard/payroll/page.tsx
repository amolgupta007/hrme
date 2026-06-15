import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";
import { isAdmin } from "@/lib/current-user";
import { listEmployees } from "@/actions/employees";
import {
  getSalaryStructures,
  getSalaryStructureConfig,
  getPayrollRuns,
  getMyPayslips,
  getMyCompensation,
} from "@/actions/payroll";
import { PayrollClient } from "@/components/payroll/payroll-client";
import { createAdminSupabase } from "@/lib/supabase/server";
import { getRazorpayXCredentials } from "@/actions/razorpayx-credentials";
import { getLateFlagsForMonth } from "@/actions/late-policy";

export default async function PayrollPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "payroll", userCtx?.customFeatures ?? null)) {
    return <UpgradeGate feature="Payroll & Compensation" requiredPlan="business" currentPlan={plan} />;
  }

  const adminUser = userCtx ? isAdmin(userCtx.role) : false;

  const [empResult, salaryResult, runsResult, mySlipsResult, myCompResult, configResult, credsResult] = await Promise.all([
    listEmployees(),
    adminUser ? getSalaryStructures() : Promise.resolve({ success: true as const, data: [] }),
    adminUser ? getPayrollRuns() : Promise.resolve({ success: true as const, data: [] }),
    getMyPayslips(),
    getMyCompensation(),
    adminUser ? getSalaryStructureConfig() : Promise.resolve({ success: true as const, data: null }),
    adminUser ? getRazorpayXCredentials() : Promise.resolve({ success: true as const, data: null }),
  ]);
  const razorpayxConnected = credsResult.success && credsResult.data != null;

  const employees = empResult.success ? empResult.data : [];
  const salaryStructures = salaryResult.success ? salaryResult.data : [];
  const payrollRuns = runsResult.success ? runsResult.data : [];
  // history is ordered by effective_from DESC; [0] is the most recently effective config
  const activeConfigCreatedAt =
    configResult.success && configResult.data && configResult.data.history.length > 0
      ? configResult.data.history[0].created_at
      : null;
  const myPayslips = mySlipsResult.success ? mySlipsResult.data : [];
  const myCompensation = myCompResult.success ? myCompResult.data : null;

  // Late-policy flags keyed by run month (admin-only). Drives the bonus-ineligible badge.
  const lateFlagsByMonth: Record<
    string,
    Array<{ employee_id: string; late_days_count: number; status: "flagged" | "overridden" }>
  > = {};
  if (adminUser) {
    const months = Array.from(new Set((payrollRuns as { month: string }[]).map((r) => r.month)));
    const flagResults = await Promise.all(months.map((m) => getLateFlagsForMonth(m)));
    months.forEach((m, i) => {
      const res = flagResults[i];
      lateFlagsByMonth[m] = res.success ? res.data : [];
    });
  }

  // Get org name
  let orgName = "Your Company";
  if (userCtx) {
    const supabase = createAdminSupabase();
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", userCtx.orgId)
      .single();
    if (org) orgName = (org as { name: string }).name;
  }

  // Current employee name for payslip display
  let currentEmployeeName = "Employee";
  if (userCtx?.employeeId) {
    const emp = (employees as any[]).find((e) => e.id === userCtx.employeeId);
    if (emp) currentEmployeeName = `${emp.first_name} ${emp.last_name}`;
  }

  return (
    <PayrollClient
      isAdmin={adminUser}
      employees={employees as any}
      salaryStructures={salaryStructures}
      payrollRuns={payrollRuns}
      myPayslips={myPayslips}
      myCompensation={myCompensation}
      orgName={orgName}
      currentEmployeeName={currentEmployeeName}
      activeConfigCreatedAt={activeConfigCreatedAt}
      razorpayxConnected={razorpayxConnected}
      lateFlagsByMonth={lateFlagsByMonth}
    />
  );
}
