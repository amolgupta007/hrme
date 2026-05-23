import { REVIEW_CYCLE_END_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface ReviewData {
  cycles: Array<{ id: string; end_date: string | null }>;
  incompleteByCycle: Record<string, number>;
}

export const reviewCycleIncomplete: InsightRule<ReviewData> = {
  key: "review_cycle_incomplete",
  category: "people",
  basePriority: 75,
  deepLink: "/dashboard/reviews",
  requiredFeature: "reviews",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<ReviewData> {
    const { data: cyc } = await supabase
      .from("review_cycles")
      .select("id, end_date")
      .eq("org_id", ctx.orgId)
      .eq("status", "active");
    const cycles = (cyc ?? []) as ReviewData["cycles"];
    const incompleteByCycle: Record<string, number> = {};
    for (const c of cycles) {
      const { data: revs } = await supabase
        .from("reviews")
        .select("status")
        .eq("org_id", ctx.orgId)
        .eq("cycle_id", c.id);
      incompleteByCycle[c.id] = ((revs ?? []) as Array<{ status: string }>)
        .filter((r) => r.status !== "completed").length;
    }
    return { cycles, incompleteByCycle };
  },
  evaluate(data: ReviewData, ctx: InsightContext): Insight | null {
    const windowEnd = addDays(ctx.today, REVIEW_CYCLE_END_DAYS);
    let worst = 0;
    for (const c of data.cycles) {
      if (!c.end_date) continue;
      const end = new Date(c.end_date);
      if (end >= ctx.today && end <= windowEnd) {
        worst = Math.max(worst, data.incompleteByCycle[c.id] ?? 0);
      }
    }
    if (worst === 0) return null;
    return {
      ruleKey: this.key, category: "people", priority: this.basePriority,
      title: "Review cycle closing soon",
      body: `${worst} review${worst === 1 ? "" : "s"} still incomplete in a cycle ending within ${REVIEW_CYCLE_END_DAYS} days`,
      metricCount: worst, deepLink: this.deepLink,
    };
  },
};
