import { listEmployees } from "@/actions/employees";
import { listDepartments } from "@/actions/departments";
import { getAllEmployeesOnboardingStatus } from "@/actions/onboarding";
import { EmployeesClient } from "@/components/dashboard/employees-client";
import { getCurrentUser, isAdmin } from "@/lib/current-user";

export default async function EmployeesPage() {
  const [employeesResult, departmentsResult, userCtx] = await Promise.all([
    listEmployees(),
    listDepartments(),
    getCurrentUser(),
  ]);

  const employees = employeesResult.success ? employeesResult.data : [];
  const departments = departmentsResult.success ? departmentsResult.data : [];
  const role = userCtx?.role ?? "employee";

  // Only fetch onboarding data for admins/owners
  const onboardingResult =
    isAdmin(role) ? await getAllEmployeesOnboardingStatus() : null;
  const onboardingData = onboardingResult?.success ? onboardingResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team members, roles, and onboarding progress.
        </p>
      </div>
      <EmployeesClient
        employees={employees}
        departments={departments}
        role={role}
        onboardingData={onboardingData}
      />
    </div>
  );
}
