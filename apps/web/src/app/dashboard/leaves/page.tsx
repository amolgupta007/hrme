import { listLeavePolicies, listLeaveRequests, listEmployeeBalances } from "@/actions/leaves";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/lib/current-user";
import { LeavesClient } from "@/components/leaves/leaves-client";

export default async function LeavesPage() {
  const [policiesResult, requestsResult, employeesResult, balancesResult, userCtx] = await Promise.all([
    listLeavePolicies(),
    listLeaveRequests(),
    listEmployees(),
    listEmployeeBalances(),
    getCurrentUser(),
  ]);

  const policies = policiesResult.success ? policiesResult.data : [];
  const requests = requestsResult.success ? requestsResult.data : [];
  const allEmployees = employeesResult.success ? employeesResult.data : [];
  const balances = balancesResult.success ? balancesResult.data : [];
  const role = userCtx?.role ?? "employee";
  const currentEmployeeId = userCtx?.employeeId ?? null;

  // Scope the request-for list: admins see everyone, managers see themselves +
  // their direct reports (either manager slot), employees see only themselves.
  const employees =
    role === "owner" || role === "admin"
      ? allEmployees
      : role === "manager"
        ? allEmployees.filter(
            (e) =>
              e.id === currentEmployeeId ||
              e.reporting_manager_id === currentEmployeeId ||
              e.reporting_manager_2_id === currentEmployeeId
          )
        : allEmployees.filter((e) => e.id === currentEmployeeId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
        <p className="mt-1 text-muted-foreground">
          Request time off and manage leave approvals.
        </p>
      </div>

      <LeavesClient
        employees={employees}
        policies={policies}
        requests={requests}
        balances={balances}
        role={role}
        currentEmployeeId={currentEmployeeId}
      />
    </div>
  );
}
