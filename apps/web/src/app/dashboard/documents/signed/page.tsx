import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { listSignedRecords, listIssuedDocuments } from "@/actions/documents-templating";
import { DocumentsNav } from "@/components/documents/documents-nav";
import { SignedRecordsClient } from "@/components/documents/signed-records-client";

export const dynamic = "force-dynamic";

export default async function SignedRecordsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan, "document_templating", user.customFeatures)) {
    return <UpgradeGate feature="Offer Letters" requiredPlan="business" currentPlan={user.plan} />;
  }

  const [signed, issued] = await Promise.all([listSignedRecords(), listIssuedDocuments()]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Offer Letters &amp; Documents</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Track issued documents and download signed records. Signed records are an append-only audit
          trail visible to owners and admins only.
        </p>
      </div>
      <DocumentsNav />
      <SignedRecordsClient
        signed={signed.success ? signed.data : []}
        issued={issued.success ? issued.data : []}
      />
    </div>
  );
}
