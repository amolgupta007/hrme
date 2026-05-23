import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface DocsData {
  requiredDocIds: string[];
  acksByDoc: Record<string, Set<string>>;
  activeEmployeeIds: string[];
}

export const docsUnacknowledged: InsightRule<DocsData> = {
  key: "docs_unacknowledged",
  category: "compliance",
  basePriority: 85,
  deepLink: "/dashboard/documents",
  requiredFeature: "documents",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<DocsData> {
    const { data: docs } = await supabase
      .from("documents")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("requires_acknowledgment", true)
      .eq("is_company_wide", true);
    const requiredDocIds = ((docs ?? []) as Array<{ id: string }>).map((d) => d.id);
    const { data: emps } = await supabase
      .from("employees")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    const activeEmployeeIds = ((emps ?? []) as Array<{ id: string }>).map((e) => e.id);
    const acksByDoc: Record<string, Set<string>> = {};
    if (requiredDocIds.length > 0) {
      const { data: acks } = await supabase
        .from("document_acknowledgments")
        .select("document_id, employee_id")
        .in("document_id", requiredDocIds);
      for (const a of (acks ?? []) as Array<{ document_id: string; employee_id: string }>) {
        (acksByDoc[a.document_id] ??= new Set()).add(a.employee_id);
      }
    }
    return { requiredDocIds, acksByDoc, activeEmployeeIds };
  },
  evaluate(data: DocsData): Insight | null {
    let outstanding = 0;
    for (const docId of data.requiredDocIds) {
      const acked = data.acksByDoc[docId] ?? new Set<string>();
      for (const empId of data.activeEmployeeIds) if (!acked.has(empId)) outstanding++;
    }
    if (outstanding === 0) return null;
    return {
      ruleKey: this.key, category: "compliance", priority: this.basePriority,
      title: "Documents need acknowledgement",
      body: `${outstanding} required-document acknowledgement${outstanding === 1 ? "" : "s"} outstanding`,
      metricCount: outstanding, deepLink: this.deepLink,
    };
  },
};
