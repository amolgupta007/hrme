import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface GrvRow { id: string }

export const grievancesUrgent: InsightRule<GrvRow[]> = {
  key: "grievances_urgent",
  category: "ops",
  basePriority: 110,
  deepLink: "/dashboard/grievances",
  requiredFlag: "grievancesEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("grievances")
      .select("id")
      .eq("org_id", ctx.orgId)
      .eq("severity", "urgent")
      .in("status", ["open", "in_review"]);
    return (data ?? []) as GrvRow[];
  },
  evaluate(rows: GrvRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Urgent grievances open",
      body: `${n} urgent grievance${n === 1 ? "" : "s"} awaiting resolution`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
