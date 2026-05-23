import { addDays } from "../constants";
import type { AdminSupabase, Insight, InsightContext, InsightRule } from "../types";

interface AttRow { auto_closed: boolean }

export const attendanceAnomalies: InsightRule<AttRow[]> = {
  key: "attendance_anomalies",
  category: "ops",
  basePriority: 50,
  deepLink: "/dashboard/attendance",
  requiredFlag: "attendanceEnabled",
  async fetch(supabase: AdminSupabase, ctx: InsightContext) {
    const yesterday = addDays(ctx.today, -1).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("attendance_records")
      .select("auto_closed")
      .eq("org_id", ctx.orgId)
      .eq("date", yesterday);
    return (data ?? []) as AttRow[];
  },
  evaluate(rows: AttRow[]): Insight | null {
    const n = rows.filter((r) => r.auto_closed).length;
    if (n === 0) return null;
    return {
      ruleKey: this.key, category: "ops", priority: this.basePriority,
      title: "Attendance needs review",
      body: `${n} shift${n === 1 ? "" : "s"} were auto-closed yesterday`,
      metricCount: n, deepLink: this.deepLink,
    };
  },
};
