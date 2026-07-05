import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { listTemplates } from "@/actions/documents-templating";
import { DocumentsNav } from "@/components/documents/documents-nav";
import { TemplatesClient } from "@/components/documents/templates-client";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan, "document_templating", user.customFeatures)) {
    return <UpgradeGate feature="Offer Letters" requiredPlan="business" currentPlan={user.plan} />;
  }

  const res = await listTemplates();
  const templates = res.success ? res.data : [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-2">
        <h1 className="text-2xl font-bold tracking-tight">Offer Letters &amp; Documents</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Build clause-based templates, issue them to employees with per-person variables, and track
          e-acknowledgements.
        </p>
      </div>
      <DocumentsNav />
      <TemplatesClient initial={templates} />
    </div>
  );
}
