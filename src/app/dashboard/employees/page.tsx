import { listEmployees, listDepartments } from "@/actions/employees";
import { EmployeesClient } from "@/components/dashboard/employees-client";

export default async function EmployeesPage() {
  const [employeesResult, departmentsResult] = await Promise.all([
    listEmployees(),
    listDepartments(),
  ]);

  const employees = employeesResult.success ? employeesResult.data : [];
  const departments = departmentsResult.success ? departmentsResult.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your team directory and employee profiles.
        </p>
      </div>

      <EmployeesClient employees={employees} departments={departments} />
    </div>
  );
}
