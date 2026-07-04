import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { getIssuanceContext } from "@/actions/documents-templating";
import { DocumentsNav } from "@/components/documents/documents-nav";
import { IssuanceWizard } from "@/components/documents/issuance-wizard";

export const dynamic = "force-dynamic";

export default async function IssuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan, "document_templating", user.customFeatures)) {
    return <UpgradeGate feature="Offer Letters" requiredPlan="business" currentPlan={user.plan} />;
  }

  const res = await getIssuanceContext();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Offer Letters &amp; Documents</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Issue an active template to one or more employees. Variables auto-fill from each employee&rsquo;s
          record — override any value before sending.
        </p>
      </div>
      <DocumentsNav />
      {res.success ? (
        <IssuanceWizard ctx={res.data} />
      ) : (
        <p className="text-sm text-destructive">{res.error}</p>
      )}
    </div>
  );
}
