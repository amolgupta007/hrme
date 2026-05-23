import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface OverdueRow { id: string }

export const trainingOverdue: InsightRule<OverdueRow[]> = {
  key: "training_overdue",
  category: "compliance",
  basePriority: 90,
  deepLink: "/dashboard/training",
  requiredFeature: "training",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("training_enrollments")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("status", "overdue");
    return (data ?? []) as OverdueRow[];
  },
  evaluate(rows: OverdueRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "compliance", priority: this.basePriority,
      title: "Training overdue",
      body: `${n} training enrollment${n === 1 ? "" : "s"} are overdue`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
