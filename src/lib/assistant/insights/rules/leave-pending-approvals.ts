import { PENDING_LEAVE_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface PendingRow { id: string; created_at: string }

export const leavePendingApprovals: InsightRule<PendingRow[]> = {
  key: "leave_pending_approvals",
  category: "leave",
  basePriority: 100,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("leave_requests")
      .select("id, created_at")
      .eq("org_id", ctx.orgId)
      .eq("status", "pending");
    return (data ?? []) as PendingRow[];
  },
  evaluate(rows: PendingRow[], ctx: InsightContext): Insight | null {
    const cutoff = addDays(ctx.today, -PENDING_LEAVE_DAYS);
    const aging = rows.filter((r) => new Date(r.created_at) < cutoff).length;
    if (aging === 0) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Leave approvals waiting",
      body: `${aging} leave request${aging === 1 ? "" : "s"} pending more than ${PENDING_LEAVE_DAYS} days`,
      metricCount: aging, deepLink: this.deepLink,
    };
  },
};
