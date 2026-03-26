import { listEmployees, listDepartments } from "@/actions/employees";
import { getCurrentUser } from "@/lib/current-user";
import { EmployeesClient } from "@/components/dashboard/employees-client";

export default async function EmployeesPage() {
  const [employeesResult, departmentsResult, userCtx] = await Promise.all([
    listEmployees(),
    listDepartments(),
    getCurrentUser(),
  ]);

  const employees = employeesResult.success ? employeesResult.data : [];
  const departments = departmentsResult.success ? departmentsResult.data : [];
  const role = userCtx?.role ?? "employee";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team directory and employee profiles.
        </p>
      </div>

      <EmployeesClient employees={employees} departments={departments} role={role} />
    </div>
  );
}
