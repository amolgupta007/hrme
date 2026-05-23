import { LEAVE_CONCENTRATION_MIN, LEAVE_CONCENTRATION_WINDOW_DAYS, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface ConcData {
  leaves: Array<{ employee_id: string; start_date: string; end_date: string }>;
  deptByEmployee: Record<string, string | null>;
}

export const leaveConcentration: InsightRule<ConcData> = {
  key: "leave_concentration",
  category: "leave",
  basePriority: 70,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<ConcData> {
    const windowEnd = addDays(ctx.today, LEAVE_CONCENTRATION_WINDOW_DAYS).toISOString().slice(0, 10);
    const todayStr = ctx.today.toISOString().slice(0, 10);
    const { data: leaves } = await supabase
      .from("leave_requests")
      .select("employee_id, start_date, end_date")
      .eq("org_id", ctx.orgId)
      .eq("status", "approved")
      .gte("end_date", todayStr)
      .lte("start_date", windowEnd);
    const { data: emps } = await supabase
      .from("employees")
      .select("id, department_id")
      .eq("org_id", ctx.orgId);
    const deptByEmployee: Record<string, string | null> = {};
    for (const e of (emps ?? []) as Array<{ id: string; department_id: string | null }>) {
      deptByEmployee[e.id] = e.department_id;
    }
    return { leaves: (leaves ?? []) as ConcData["leaves"], deptByEmployee };
  },
  evaluate(data: ConcData, _ctx: InsightContext): Insight | null {
    const perDept: Record<string, Set<string>> = {};
    for (const lv of data.leaves) {
      const dept = data.deptByEmployee[lv.employee_id];
      if (!dept) continue;
      (perDept[dept] ??= new Set()).add(lv.employee_id);
    }
    let worst = 0;
    for (const set of Object.values(perDept)) worst = Math.max(worst, set.size);
    if (worst < LEAVE_CONCENTRATION_MIN) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Upcoming leave is concentrated",
      body: `${worst} people in one department are on approved leave in the next ${LEAVE_CONCENTRATION_WINDOW_DAYS} days`,
      metricCount: worst, deepLink: this.deepLink,
    };
  },
};
