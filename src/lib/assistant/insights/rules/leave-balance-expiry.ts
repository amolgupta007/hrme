import { BALANCE_EXPIRY_DAYS, MIN_LEAVE_BALANCE_FLAG, addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface BalRow { employee_id: string; total_days: number; used_days: number; carried_forward_days: number }

export const leaveBalanceExpiry: InsightRule<BalRow[]> = {
  key: "leave_balance_expiry",
  category: "leave",
  basePriority: 40,
  deepLink: "/dashboard/leaves",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const { data } = await supabase
      .from("leave_balances")
      .select("employee_id, total_days, used_days, carried_forward_days")
      .eq("org_id", ctx.orgId);
    return (data ?? []) as BalRow[];
  },
  evaluate(rows: BalRow[], ctx: InsightContext): Insight | null {
    // Only fires within BALANCE_EXPIRY_DAYS before Dec 31 (calendar leave-year, v1 simplification).
    const yearEnd = new Date(`${ctx.today.getUTCFullYear()}-12-31T00:00:00.000Z`);
    const windowStart = addDays(yearEnd, -BALANCE_EXPIRY_DAYS);
    if (ctx.today < windowStart || ctx.today > yearEnd) return null;
    const employees = new Set<string>();
    for (const b of rows) {
      const remaining = (b.total_days ?? 0) + (b.carried_forward_days ?? 0) - (b.used_days ?? 0);
      if (remaining >= MIN_LEAVE_BALANCE_FLAG) employees.add(b.employee_id);
    }
    if (employees.size === 0) return null;
    return {
      ruleKey: this.key, category: "leave", priority: this.basePriority,
      title: "Unused leave expiring soon",
      body: `${employees.size} employee${employees.size === 1 ? "" : "s"} still hold ${MIN_LEAVE_BALANCE_FLAG}+ days of leave before year-end`,
      metricCount: employees.size, deepLink: this.deepLink,
    };
  },
};
