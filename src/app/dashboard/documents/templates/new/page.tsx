import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import { listClauseLibrary, listDocumentVariables } from "@/actions/documents-templating";
import { TemplateBuilder } from "@/components/documents/template-builder";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan, "document_templating", user.customFeatures)) {
    return <UpgradeGate feature="Offer Letters" requiredPlan="business" currentPlan={user.plan} />;
  }

  const [lib, vars] = await Promise.all([listClauseLibrary(), listDocumentVariables()]);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/documents/templates" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to templates
      </Link>
      <h1 className="text-2xl font-bold tracking-tight mb-5">New template</h1>
      <TemplateBuilder
        initialName=""
        initialType="offer_letter"
        initialClauses={[]}
        library={lib.success ? lib.data : []}
        variables={vars.success ? vars.data : []}
      />
    </div>
  );
}
