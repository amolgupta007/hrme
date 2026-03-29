import { listDocuments } from "@/actions/documents";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser } from "@/lib/current-user";
import { DocumentsClient } from "@/components/documents/documents-client";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

export default async function DocumentsPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "documents")) {
    return <UpgradeGate feature="Documents" requiredPlan="growth" currentPlan={plan} />;
  }

  const [docsResult, empsResult] = await Promise.all([
    listDocuments(),
    listEmployees(),
  ]);

  const documents = docsResult.success ? docsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const role = userCtx?.role ?? "employee";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Company policies, contracts, and employee files.
        </p>
      </div>

      <DocumentsClient documents={documents} employees={employees} role={role} />
    </div>
  );
}
