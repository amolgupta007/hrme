import { STALLED_STAGE_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface AppRow { id: string; updated_at: string }

export const hiringStalled: InsightRule<AppRow[]> = {
  key: "hiring_stalled",
  category: "ops",
  basePriority: 80,
  deepLink: "/hire/candidates",
  requiredFlag: "jambaHireEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("applications")
      .select("id, updated_at")
      .eq("org_id", ctx.orgId)
      .not("stage", "in", '("hired","rejected")');
    return (data ?? []) as AppRow[];
  },
  evaluate(rows: AppRow[], ctx: InsightContext): Insight | null {
    const cutoff = addDays(ctx.today, -STALLED_STAGE_DAYS);
    const stalled = rows.filter((r) => new Date(r.updated_at) < cutoff).length;
    if (stalled === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Candidates stalled in pipeline",
      body: `${stalled} application${stalled === 1 ? "" : "s"} have not moved in over ${STALLED_STAGE_DAYS} days`,
      metricCount: stalled, deepLink: this.deepLink,
    };
  },
};
