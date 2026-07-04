import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, isAdmin } from "@/lib/current-user";
import { hasFeature } from "@/config/plans";
import { UpgradeGate } from "@/components/layout/upgrade-gate";
import {
  getTemplate,
  listClauseLibrary,
  listDocumentVariables,
} from "@/actions/documents-templating";
import { TemplateBuilder } from "@/components/documents/template-builder";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!isAdmin(user.role)) redirect("/dashboard");
  if (!hasFeature(user.plan, "document_templating", user.customFeatures)) {
    return <UpgradeGate feature="Offer Letters" requiredPlan="business" currentPlan={user.plan} />;
  }

  const [tpl, lib, vars] = await Promise.all([
    getTemplate(params.id),
    listClauseLibrary(),
    listDocumentVariables(),
  ]);
  if (!tpl.success) notFound();

  const clauses = tpl.data.clauses.map((c, i) => ({
    key: `c_${c.id ?? i}`,
    title: c.title,
    body_markdown: c.body_markdown,
    is_mandatory: c.is_mandatory,
    category: c.category,
  }));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/dashboard/documents/templates" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to templates
      </Link>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Edit template</h1>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tpl.data.status}</span>
      </div>
      <TemplateBuilder
        templateId={tpl.data.id}
        initialName={tpl.data.name}
        initialType={tpl.data.type}
        initialClauses={clauses}
        library={lib.success ? lib.data : []}
        variables={vars.success ? vars.data : []}
      />
    </div>
  );
}
