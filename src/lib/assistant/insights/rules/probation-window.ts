import { PROBATION_DAYS, PROBATION_LOOKAHEAD_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface EmpRow { id: string; date_of_joining: string }

export const probationWindow: InsightRule<EmpRow[]> = {
  key: "probation_window",
  category: "people",
  basePriority: 55,
  deepLink: "/dashboard/employees",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("employees")
      .select("id, date_of_joining")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    return (data ?? []) as EmpRow[];
  },
  evaluate(rows: EmpRow[], ctx: InsightContext): Insight | null {
    const windowEnd = addDays(ctx.today, PROBATION_LOOKAHEAD_DAYS);
    let count = 0;
    for (const e of rows) {
      const probationEnd = addDays(new Date(e.date_of_joining), PROBATION_DAYS);
      if (probationEnd >= ctx.today && probationEnd <= windowEnd) count++;
    }
    if (count === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "Probation reviews due",
      body: `${count} employee${count === 1 ? "" : "s"} reach ${PROBATION_DAYS}-day probation within a week`,
      metricCount: count, deepLink: this.deepLink,
    };
  },
};
