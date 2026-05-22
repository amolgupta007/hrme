import type { createAdminSupabase } from "@/lib/supabase/server";
import type { OrgPlan, PlanFeature } from "@/config/plans";

export type AdminSupabase = ReturnType<typeof createAdminSupabase>;

export type InsightCategory = "leave" | "compliance" | "people" | "ops";

export interface Insight {
  ruleKey: string;
  category: InsightCategory;
  priority: number;
  title: string;
  body: string;
  metricCount: number | null;
  deepLink: string;
}

export interface InsightContext {
  orgId: string;
  plan: OrgPlan;
  /** For plan === "custom": the org's enabled feature keys. Forwarded to hasFeature. */
  customFeatures?: string[] | null;
  /** "now" expressed in IST wall-clock (UTC fields hold IST). Use for date math only. */
  today: Date;
  flags: {
    jambaHireEnabled: boolean;
    attendanceEnabled: boolean;
    grievancesEnabled: boolean;
  };
}

export interface InsightRule<TData = unknown> {
  key: string;
  category: InsightCategory;
  basePriority: number;
  deepLink: string;
  requiredFeature?: PlanFeature;
  requiredFlag?: keyof InsightContext["flags"];
  fetch(supabase: AdminSupabase, ctx: InsightContext): Promise<TData>;
  /** PURE: data + ctx in, one Insight or null out. No I/O. */
  evaluate(data: TData, ctx: InsightContext): Insight | null;
}
