import { NEW_JOINER_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface JoinerRow { id: string; date_of_joining: string }

export const newJoiners: InsightRule<JoinerRow[]> = {
  key: "new_joiners",
  category: "people",
  basePriority: 60,
  deepLink: "/dashboard/employees",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const since = addDays(ctx.today, -NEW_JOINER_DAYS).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("employees")
      .select("id, date_of_joining")
      .eq("org_id", ctx.orgId)
      .eq("status", "active")
      .gte("date_of_joining", since);
    return (data ?? []) as JoinerRow[];
  },
  evaluate(rows: JoinerRow[]): Insight | null {
    const n = rows.length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "New joiners this week",
      body: `${n} employee${n === 1 ? "" : "s"} joined in the last ${NEW_JOINER_DAYS} days`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
