import { listDocuments, getSignedRecords } from "@/actions/documents";
import { listEmployees } from "@/actions/employees";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { DocumentsClient } from "@/components/documents/documents-client";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { hasFeature } from "@/config/plans";

export default async function DocumentsPage() {
  const userCtx = await getCurrentUser();
  const plan = userCtx?.plan ?? "starter";

  if (!hasFeature(plan, "documents", userCtx?.customFeatures ?? null)) {
    return <UpgradeGate feature="Documents" requiredPlan="growth" currentPlan={plan} />;
  }

  const role = userCtx?.role ?? "employee";

  const [docsResult, empsResult, signedResult] = await Promise.all([
    listDocuments(),
    listEmployees(),
    isAdmin(role) ? getSignedRecords() : Promise.resolve({ success: true as const, data: [] }),
  ]);

  const documents = docsResult.success ? docsResult.data : [];
  const employees = empsResult.success ? empsResult.data : [];
  const signedRecords = signedResult.success ? signedResult.data : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Company policies, contracts, and employee files.
        </p>
      </div>

      <DocumentsClient
        documents={documents}
        employees={employees}
        role={role}
        signedRecords={signedRecords}
      />
    </div>
  );
}
