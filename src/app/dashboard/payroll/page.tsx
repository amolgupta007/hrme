import { getCurrentUser } from "@/lib/current-user";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";
import { isAdmin } from "@/lib/current-user";
import { listEmployees } from "@/actions/employees";
import {
  getSalaryStructures,
  getPayrollRuns,
  getMyPayslips,
  getMyCompensation,
} from "@/actions/payroll";
import { PayrollClient } from "@/components/payroll/payroll-client";
import { createAdminSupabase } from "@/lib/supabase/server";

export default async function PayrollPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "payroll", userCtx?.customFeatures ?? null)) {
    return <UpgradeGate feature="Payroll & Compensation" requiredPlan="business" currentPlan={plan} />;
  }

  const adminUser = userCtx ? isAdmin(userCtx.role) : false;

  const [empResult, salaryResult, runsResult, mySlipsResult, myCompResult] = await Promise.all([
    listEmployees(),
    adminUser ? getSalaryStructures() : Promise.resolve({ success: true as const, data: [] }),
    adminUser ? getPayrollRuns() : Promise.resolve({ success: true as const, data: [] }),
    getMyPayslips(),
    getMyCompensation(),
  ]);

  const employees = empResult.success ? empResult.data : [];
  const salaryStructures = salaryResult.success ? salaryResult.data : [];
  const payrollRuns = runsResult.success ? runsResult.data : [];
  const myPayslips = mySlipsResult.success ? mySlipsResult.data : [];
  const myCompensation = myCompResult.success ? myCompResult.data : null;

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
    />
  );
}
