import Link from "next/link";
import { FileSignature, ArrowRight } from "lucide-react";
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

  const showTemplating = isAdmin(role) && hasFeature(plan, "document_templating", userCtx?.customFeatures ?? null);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-muted-foreground">
          Company policies, contracts, and employee files.
        </p>
      </div>

      {showTemplating && (
        <Link
          href="/dashboard/documents/templates"
          className="group flex items-center gap-4 rounded-xl border border-border bg-gradient-to-r from-primary/5 to-transparent p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <FileSignature className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground">Offer letters &amp; document templating</p>
            <p className="text-sm text-muted-foreground">
              Build clause-based offer letters, issue them with per-employee variables, and collect
              e-acknowledgements.
            </p>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
        </Link>
      )}

      <DocumentsClient
        documents={documents}
        employees={employees}
        role={role}
        signedRecords={signedRecords}
      />
    </div>
  );
}
