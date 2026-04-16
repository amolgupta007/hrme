import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { listDepartments } from "@/actions/employees";
import { ImportClient } from "@/components/dashboard/import-client";

export default async function EmployeeImportPage() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user.role)) {
    redirect("/dashboard/employees");
  }

  const deptsResult = await listDepartments();
  const departments = deptsResult.success ? deptsResult.data : [];
  const plan = user.plan ?? "starter";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Employees</h1>
        <p className="mt-1 text-muted-foreground">
          Upload a CSV to bulk-add employees to your organization.
        </p>
      </div>
      <ImportClient departments={departments} plan={plan} />
    </div>
  );
}
